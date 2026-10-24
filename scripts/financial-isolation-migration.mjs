// Run in a maintenance window using a migration principal with TRIGGER privilege.
// DDL is additive; legacy financial history is retained, never certified as money.
export async function migrateFinancialIsolation(db) {
  const domainTables = ["accounts", "transactions", "tuition_invoices", "beneficiaries",
    "financial_requests", "financial_events", "financial_ledger_entries", "family_links",
    "transfer_quotes", "sandbox_transfers", "saved_cards", "demo_payments"];
  async function column(table, name, definition) {
    const [found] = await db.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", [table, name]);
    if (!found.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  for (const table of domainTables) await column(table, "financial_environment", "VARCHAR(6) NULL");
  await column("accounts", "legacy_unverified_balance", "DECIMAL(18,2) NOT NULL DEFAULT 0");
  await column("accounts", "recorded_balance", "DECIMAL(18,2) NOT NULL DEFAULT 0");
  await column("transactions", "evidence_type", "VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'");
  await column("tuition_invoices", "legacy_unverified_paid", "DECIMAL(18,2) NOT NULL DEFAULT 0");
  await column("beneficiaries", "verification_status", "VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'");
  await db.query(`CREATE TABLE IF NOT EXISTS financial_migration_evidence (
    entity_type VARCHAR(40) NOT NULL, entity_id VARCHAR(64) NOT NULL,
    reason VARCHAR(80) NOT NULL, snapshot JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(entity_type,entity_id,reason)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS provider_webhook_events (
    processor VARCHAR(16) NOT NULL, environment VARCHAR(10) NOT NULL,
    event_id VARCHAR(255) NOT NULL, event_type VARCHAR(100) NOT NULL,
    payload_hash CHAR(64) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
    attempts INT NOT NULL DEFAULT 1, lease_until DATETIME NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, processed_at DATETIME NULL,
    PRIMARY KEY(processor,environment,event_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS financial_reconciliation_issues (
    id CHAR(36) PRIMARY KEY, environment VARCHAR(10) NOT NULL,
    processor VARCHAR(16) NOT NULL, external_id VARCHAR(255) NOT NULL,
    issue_type VARCHAR(80) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY issue_once(environment,processor,external_id,issue_type)
  )`);
  const [done] = await db.execute("SELECT id FROM platform_migrations WHERE id='financial-isolation-v1'");
  if (!done.length) {
    await db.beginTransaction();
    try {
      // Preserve the exact old amounts before removing their availability.
      await db.query(`INSERT IGNORE INTO financial_migration_evidence(entity_type,entity_id,reason,snapshot)
        SELECT 'accounts',a.id,'UNVERIFIED_LIVE_OPENING',JSON_OBJECT('balance',a.balance,'currency',a.currency)
        FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.is_demo=0`);
      await db.query(`UPDATE accounts a JOIN users u ON u.id=a.user_id
        SET a.legacy_unverified_balance=a.balance,a.balance=0 WHERE u.is_demo=0`);
      await db.query(`UPDATE tuition_invoices t JOIN users u ON u.id=t.user_id
        SET t.legacy_unverified_paid=t.paid,t.paid=0 WHERE u.is_demo=0`);
      for (const table of domainTables.filter(t => !["family_links", "financial_events", "financial_ledger_entries"].includes(t))) {
        // Accounts and beneficiary identities remain usable; old transaction evidence is legacy.
        const live = ["accounts", "beneficiaries", "tuition_invoices"].includes(table) ? "LIVE" : "LEGACY";
        await db.query(`UPDATE ${table} t JOIN users u ON u.id=t.user_id SET t.financial_environment=IF(u.is_demo=1,'DEMO','${live}') WHERE t.financial_environment IS NULL`);
      }
      for (const table of ["financial_events", "financial_ledger_entries"])
        await db.query(`UPDATE ${table} t JOIN financial_requests r ON r.id=t.request_id SET t.financial_environment=r.financial_environment WHERE t.financial_environment IS NULL`);
      await db.query(`INSERT IGNORE INTO financial_migration_evidence(entity_type,entity_id,reason,snapshot)
        SELECT 'family_links',f.id,'CROSS_ENVIRONMENT',JSON_OBJECT('status',f.status)
        FROM family_links f JOIN users s ON s.id=f.student_id JOIN users p ON p.id=f.parent_id WHERE s.is_demo<>p.is_demo`);
      await db.query(`UPDATE family_links f JOIN users s ON s.id=f.student_id LEFT JOIN users p ON p.id=f.parent_id
        SET f.financial_environment=IF(p.id IS NOT NULL AND s.is_demo<>p.is_demo,'LEGACY',IF(s.is_demo=1,'DEMO','LIVE')),
            f.status=IF(p.id IS NOT NULL AND s.is_demo<>p.is_demo,'REVOKED',f.status)`);
      // Historical sandbox purchases must not remain effective paid Live entitlements.
      await db.query(`INSERT IGNORE INTO financial_migration_evidence(entity_type,entity_id,reason,snapshot)
        SELECT 'subscriptions',s.id,'UNVERIFIED_ENTITLEMENT',JSON_OBJECT('plan',s.plan_id,'status',s.status,'ends_at',s.ends_at)
        FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE u.is_demo=0 AND s.plan_id<>'student-free'
        AND NOT EXISTS(SELECT 1 FROM provider_checkouts c WHERE c.user_id=s.user_id AND c.environment='live' AND c.status='COMPLETED' AND c.purpose='PLAN')`);
      await db.query(`UPDATE subscriptions s JOIN users u ON u.id=s.user_id SET s.status='CANCELLED'
        WHERE u.is_demo=0 AND s.plan_id<>'student-free' AND NOT EXISTS(SELECT 1 FROM provider_checkouts c WHERE c.user_id=s.user_id AND c.environment='live' AND c.status='COMPLETED' AND c.purpose='PLAN')`);
      await db.execute("INSERT INTO platform_migrations(id) VALUES ('financial-isolation-v1')");
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
  }
  async function trigger(name, timing, table, body) {
    const [found] = await db.execute("SELECT ACTION_STATEMENT body FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?", [name]);
    if (found.length && found[0].body.trim() !== `BEGIN ${body} END`) { await db.query(`DROP TRIGGER ${name}`); found.length=0; }
    if (!found.length) await db.query(`CREATE TRIGGER ${name} ${timing} ON ${table} FOR EACH ROW BEGIN ${body} END`);
  }
  const reject = (condition, message) => `IF ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}'; END IF;`;
  await trigger("fi_user_immutable", "BEFORE UPDATE", "users", reject("NOT (NEW.is_demo <=> OLD.is_demo)", "ENVIRONMENT_IMMUTABLE"));
  for (const table of domainTables.filter(t => !["family_links", "financial_events", "financial_ledger_entries"].includes(t))) {
    let extra = "";
    if (table === "accounts") extra = reject("NEW.financial_environment='LIVE' AND NEW.balance<>0", "LIVE_OPENING_BALANCE_ZERO");
    if (["saved_cards", "demo_payments", "sandbox_transfers", "transfer_quotes"].includes(table)) extra = reject("NEW.financial_environment<>'DEMO'", "LIVE_RAIL_UNAVAILABLE");
    if (table === "transactions") extra = reject("NEW.financial_environment<>'DEMO' AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.account_id AND a.type='CASH')", "LIVE_RAIL_UNAVAILABLE") + reject("NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id AND a.currency=NEW.currency AND a.financial_environment=NEW.financial_environment)", "ACCOUNT_OWNERSHIP_MISMATCH") + "SET NEW.evidence_type=IF(NEW.financial_environment='DEMO','SIMULATED','SELF_REPORTED');";
    if (table === "tuition_invoices") extra = reject("NEW.financial_environment='LIVE' AND NEW.paid<>0", "UNVERIFIED_TUITION_PAYMENT");
    if (table === "financial_requests") extra = reject("NEW.financial_environment<>'DEMO'", "LIVE_RAIL_UNAVAILABLE") +
      reject("NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id AND a.currency=NEW.currency AND a.financial_environment=NEW.financial_environment)", "ACCOUNT_OWNERSHIP_MISMATCH") +
      reject("NEW.recipient_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.recipient_account_id AND a.user_id=NEW.recipient_user_id AND a.currency=NEW.receive_currency AND a.financial_environment=NEW.financial_environment)", "ENVIRONMENT_MISMATCH") +
      reject("NEW.beneficiary_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beneficiaries b WHERE b.id=NEW.beneficiary_id AND b.user_id=NEW.user_id AND b.financial_environment=NEW.financial_environment)", "BENEFICIARY_OWNERSHIP_MISMATCH");
    const derive = `SET NEW.financial_environment=(SELECT IF(is_demo=1,'DEMO','LIVE') FROM users WHERE id=NEW.user_id);`;
    await trigger(`fi_${table}_insert`, "BEFORE INSERT", table,
      reject("NEW.financial_environment IS NOT NULL AND NEW.financial_environment<>(SELECT IF(is_demo=1,'DEMO','LIVE') FROM users WHERE id=NEW.user_id)", "ENVIRONMENT_MISMATCH") + derive + extra);
    let update = reject("NOT (NEW.user_id <=> OLD.user_id) OR NOT (NEW.financial_environment <=> OLD.financial_environment)", "ENVIRONMENT_IMMUTABLE");
    if (table === "accounts") update += reject("NEW.currency<>OLD.currency OR NOT (NEW.legacy_unverified_balance <=> OLD.legacy_unverified_balance) OR (NEW.type='CASH')<>(OLD.type='CASH')", "FINANCIAL_HISTORY_IMMUTABLE") + reject("OLD.financial_environment='LIVE' AND NEW.balance<>OLD.balance", "LIVE_RAIL_UNAVAILABLE") + reject("NEW.recorded_balance<0 OR (NEW.type<>'CASH' AND NEW.recorded_balance<>0)", "INVALID_RECORDED_BALANCE");
    if (table === "tuition_invoices") update += reject("OLD.financial_environment='LIVE' AND (NEW.paid<>OLD.paid OR NEW.legacy_unverified_paid<>OLD.legacy_unverified_paid)", "UNVERIFIED_TUITION_PAYMENT");
    if (table === "financial_requests") update += reject("OLD.financial_environment<>'DEMO'", "LEGACY_FINANCE_READ_ONLY") + reject("NEW.account_id<>OLD.account_id OR NOT (NEW.recipient_account_id <=> OLD.recipient_account_id) OR NOT (NEW.recipient_user_id <=> OLD.recipient_user_id) OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.receive_amount<>OLD.receive_amount OR NEW.receive_currency<>OLD.receive_currency", "FINANCIAL_HISTORY_IMMUTABLE");
    await trigger(`fi_${table}_update`, "BEFORE UPDATE", table, update);
  }
  const family = reject("NEW.parent_id IS NOT NULL AND (SELECT is_demo FROM users WHERE id=NEW.student_id)<>(SELECT is_demo FROM users WHERE id=NEW.parent_id)", "ENVIRONMENT_MISMATCH");
  await trigger("fi_family_insert", "BEFORE INSERT", "family_links", family + "SET NEW.financial_environment=(SELECT IF(is_demo=1,'DEMO','LIVE') FROM users WHERE id=NEW.student_id);");
  await trigger("fi_family_update", "BEFORE UPDATE", "family_links", family + reject("NEW.student_id<>OLD.student_id OR NOT (NEW.financial_environment <=> OLD.financial_environment)", "ENVIRONMENT_IMMUTABLE"));
  for (const table of ["financial_events", "financial_ledger_entries"]) {
    let check = "SET NEW.financial_environment=(SELECT financial_environment FROM financial_requests WHERE id=NEW.request_id);" + reject("NEW.financial_environment<>'DEMO' OR NEW.financial_environment IS NULL", "LIVE_RAIL_UNAVAILABLE");
    if (table === "financial_ledger_entries") check += reject("NEW.amount<=0 OR (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=NEW.account_id AND a.financial_environment=NEW.financial_environment AND a.currency=NEW.currency))", "LEDGER_ACCOUNT_MISMATCH");
    if (table === "financial_events") check += reject("NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.actor_id AND IF(u.is_demo=1,'DEMO','LIVE')=NEW.financial_environment)", "ENVIRONMENT_MISMATCH");
    await trigger(`fi_${table}_insert`, "BEFORE INSERT", table, check);
    await trigger(`fi_${table}_immutable`, "BEFORE UPDATE", table, "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FINANCIAL_HISTORY_IMMUTABLE';");
    await trigger(`fi_${table}_retain`, "BEFORE DELETE", table, reject("OLD.financial_environment<>'DEMO'", "FINANCIAL_HISTORY_IMMUTABLE"));
  }
  for (const [table, parent, key] of [["financial_approvals", "financial_requests", "request_id"], ["beneficiary_decisions", "beneficiaries", "beneficiary_id"]]) {
    const check = reject(`NOT EXISTS(SELECT 1 FROM ${parent} r JOIN users s ON s.id=r.user_id JOIN users p ON p.id=NEW.parent_id JOIN family_links f ON f.student_id=s.id AND f.parent_id=p.id AND f.status='LINKED' WHERE r.id=NEW.${key} AND s.is_demo=p.is_demo)`, "ENVIRONMENT_MISMATCH");
    await trigger(`fi_${table}_insert`, "BEFORE INSERT", table, check);
    await trigger(`fi_${table}_update`, "BEFORE UPDATE", table, check);
  }
  const checkout = reject("NEW.environment<>(SELECT IF(is_demo=1,'sandbox','live') FROM users WHERE id=NEW.user_id)", "ENVIRONMENT_MISMATCH") + reject("NEW.purpose='TOPUP' AND NEW.environment='live'", "LIVE_RAIL_UNAVAILABLE");
  await trigger("fi_checkout_insert", "BEFORE INSERT", "provider_checkouts", checkout);
  await trigger("fi_checkout_update", "BEFORE UPDATE", "provider_checkouts",
    reject("NEW.environment<>OLD.environment OR NEW.user_id<>OLD.user_id OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.provider<>OLD.provider OR NEW.purpose<>OLD.purpose OR NEW.plan_id<>OLD.plan_id OR NEW.cycle<>OLD.cycle OR NEW.recurring<>OLD.recurring OR NEW.extra_seats<>OLD.extra_seats OR NOT (NEW.request_id <=> OLD.request_id)", "FINANCIAL_HISTORY_IMMUTABLE") +
    reject("NEW.status='COMPLETED' AND OLD.status<>'COMPLETED' AND NEW.environment<>(SELECT IF(is_demo=1,'sandbox','live') FROM users WHERE id=NEW.user_id)", "ENVIRONMENT_MISMATCH"));
}
