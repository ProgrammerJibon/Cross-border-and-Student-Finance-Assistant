import { createCipheriv, createHash, randomBytes } from 'node:crypto';
export async function migrateWalletWorkflows(db) {
  async function column(table,name,definition) {
    const [r]=await db.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",[table,name]);
    if(!r.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    return !r.length;
  }
  const discoveryAdded=await column('users','discoverable','BOOLEAN NOT NULL DEFAULT 0');
  await column('users','must_rotate_password','BOOLEAN NOT NULL DEFAULT 0');
  await column('users','mfa_secret','TEXT NULL');
  await column('users','mfa_enabled','BOOLEAN NOT NULL DEFAULT 0');
  await column('users','mfa_last_step','BIGINT NOT NULL DEFAULT 0');
  await column('users','bootstrap_identity','BOOLEAN NOT NULL DEFAULT 0');
  await column('accounts','reserved_balance','DECIMAL(18,2) NOT NULL DEFAULT 0');
  if(discoveryAdded) {
    await db.query("UPDATE users SET discoverable=1 WHERE is_demo=1");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS manual_receiving_accounts (
    id CHAR(36) PRIMARY KEY, environment VARCHAR(6) NOT NULL, method VARCHAR(20) NOT NULL,
    holder VARCHAR(160) NOT NULL, identifier_cipher TEXT NOT NULL, currency CHAR(3) NOT NULL,
    instructions VARCHAR(2000) NOT NULL, minimum DECIMAL(18,2) NOT NULL, maximum DECIMAL(18,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT 0, display_order INT NOT NULL DEFAULT 0,
    updated_by VARCHAR(64) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK(environment IN ('DEMO','LIVE')), CHECK(minimum>0 AND maximum>=minimum)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_operations (
    id CHAR(36) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, account_id VARCHAR(64) NOT NULL,
    environment VARCHAR(6) NOT NULL, kind VARCHAR(30) NOT NULL, method VARCHAR(20) NOT NULL,
    amount DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL, status VARCHAR(40) NOT NULL,
    receiving_account_id CHAR(36) NULL, details_cipher TEXT NOT NULL, reference_hash CHAR(64) NULL,
    idempotency_key VARCHAR(100) NOT NULL, input_hash CHAR(64) NOT NULL,
    evidence_cipher TEXT NULL, operator_id VARCHAR(64) NULL, verified_by VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(account_id) REFERENCES accounts(id),
    FOREIGN KEY(receiving_account_id) REFERENCES manual_receiving_accounts(id),
    UNIQUE KEY operation_retry(user_id,idempotency_key), UNIQUE KEY manual_reference(receiving_account_id,reference_hash),
    INDEX(environment,status), CHECK(amount>0), CHECK(environment IN ('DEMO','LIVE')),
    CHECK(kind IN ('FUNDING_MANUAL','FUNDING_GATEWAY','WITHDRAWAL_MANUAL'))
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_operation_events (
    id CHAR(36) PRIMARY KEY, operation_id CHAR(36) NOT NULL, actor_id VARCHAR(64) NOT NULL,
    status VARCHAR(40) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(operation_id) REFERENCES wallet_operations(id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_operation_approvals (
    operation_id CHAR(36) NOT NULL, parent_id VARCHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    PRIMARY KEY(operation_id,parent_id), FOREIGN KEY(operation_id) REFERENCES wallet_operations(id), FOREIGN KEY(parent_id) REFERENCES users(id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_journal (
    id CHAR(36) PRIMARY KEY, operation_id CHAR(36) NOT NULL, phase VARCHAR(20) NOT NULL,
    book VARCHAR(20) NOT NULL, direction VARCHAR(6) NOT NULL, amount DECIMAL(18,2) NOT NULL,
    currency CHAR(3) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY posting_once(operation_id,phase,book), FOREIGN KEY(operation_id) REFERENCES wallet_operations(id),
    CHECK(amount>0), CHECK(direction IN ('DEBIT','CREDIT'))
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS family_funding_requests (
    id CHAR(36) PRIMARY KEY, student_id VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
    environment VARCHAR(6) NOT NULL, amount DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL,
    reason VARCHAR(500) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'PENDING_PARENT_APPROVAL',
    payment_id VARCHAR(64) NULL, idempotency_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL,
    FOREIGN KEY(student_id) REFERENCES users(id), FOREIGN KEY(parent_id) REFERENCES users(id),
    UNIQUE KEY request_retry(student_id,idempotency_key), CHECK(amount>0)
  )`);
  const [backfilled]=await db.execute("SELECT id FROM platform_migrations WHERE id='wallet-reservations-v1'");
  if(!backfilled.length) {
    await db.query(`UPDATE accounts a SET reserved_balance=
      (SELECT COALESCE(SUM(r.amount),0) FROM financial_requests r WHERE r.account_id=a.id AND r.held=1)
      +(SELECT COALESCE(SUM(o.amount),0) FROM wallet_operations o WHERE o.account_id=a.id AND o.kind='WITHDRAWAL_MANUAL' AND o.status IN ('WAITING_PARENT','PENDING_REVIEW','PROCESSING','PAID_PENDING_VERIFICATION'))
      WHERE a.financial_environment='DEMO'`);
    await db.execute("INSERT INTO platform_migrations(id) VALUES ('wallet-reservations-v1')");
  }
  async function trigger(name, timing, table, body) {
    const [r]=await db.execute("SELECT ACTION_STATEMENT body FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?",[name]);
    if(r.length && r[0].body.trim()===`BEGIN ${body} END`) return;
    if(r.length) await db.query(`DROP TRIGGER ${name}`);
    await db.query(`CREATE TRIGGER ${name} ${timing} ON ${table} FOR EACH ROW BEGIN ${body} END`);
  }
  const reject=(test,message)=>`IF ${test} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}'; END IF;`;
  await trigger('wf_operation_insert','BEFORE INSERT','wallet_operations',
    reject("NOT EXISTS(SELECT 1 FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id AND a.currency=NEW.currency AND a.type<>'CASH' AND a.archived=0 AND u.status='ACTIVE' AND NEW.environment=IF(u.is_demo=1,'DEMO','LIVE'))",'ACCOUNT_OWNERSHIP_MISMATCH')+
    reject("NEW.receiving_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM manual_receiving_accounts a WHERE a.id=NEW.receiving_account_id AND a.environment=NEW.environment AND a.currency=NEW.currency AND a.method=NEW.method AND a.active=1)",'ENVIRONMENT_MISMATCH')+
    reject("NEW.environment='LIVE' AND NEW.status NOT IN ('DRAFT','PENDING_VERIFICATION')",'LIVE_RAIL_UNAVAILABLE'));
  await trigger('wf_operation_update','BEFORE UPDATE','wallet_operations',
    reject("NEW.user_id<>OLD.user_id OR NEW.account_id<>OLD.account_id OR NEW.environment<>OLD.environment OR NEW.kind<>OLD.kind OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.method<>OLD.method OR NEW.details_cipher<>OLD.details_cipher OR NOT(NEW.receiving_account_id <=> OLD.receiving_account_id) OR NOT(NEW.reference_hash <=> OLD.reference_hash) OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.input_hash<>OLD.input_hash",'FINANCIAL_HISTORY_IMMUTABLE')+
    reject("OLD.environment='LIVE' AND NEW.status NOT IN ('DRAFT','PENDING_VERIFICATION','REJECTED','CANCELLED')",'LIVE_RAIL_UNAVAILABLE'));
  await trigger('wf_account_reserve','BEFORE UPDATE','accounts',reject("NEW.balance<0 OR NEW.reserved_balance<0",'NEGATIVE_BALANCE')+reject("OLD.financial_environment='LIVE' AND NEW.reserved_balance<>OLD.reserved_balance",'LIVE_RAIL_UNAVAILABLE'));
  await trigger('wf_account_insert','BEFORE INSERT','accounts',reject("NEW.balance<0 OR NEW.reserved_balance<>0",'INVALID_OPENING_BALANCE'));
  const family=reject("NOT EXISTS(SELECT 1 FROM family_links f JOIN users s ON s.id=f.student_id JOIN users p ON p.id=f.parent_id WHERE f.student_id=NEW.student_id AND f.parent_id=NEW.parent_id AND f.status='LINKED' AND s.role='STUDENT' AND p.role='PARENT' AND s.status='ACTIVE' AND p.status='ACTIVE' AND s.is_demo=p.is_demo AND NEW.environment=IF(s.is_demo=1,'DEMO','LIVE'))",'FAMILY_REQUIRED');
  await trigger('wf_family_insert','BEFORE INSERT','family_funding_requests',family);
  await trigger('wf_family_update','BEFORE UPDATE','family_funding_requests',reject("NEW.student_id<>OLD.student_id OR NEW.parent_id<>OLD.parent_id OR NEW.environment<>OLD.environment OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency",'FINANCIAL_HISTORY_IMMUTABLE'));
  await trigger('wf_receiving_update','BEFORE UPDATE','manual_receiving_accounts',reject("NEW.environment<>OLD.environment OR NEW.method<>OLD.method OR NEW.currency<>OLD.currency OR NEW.identifier_cipher<>OLD.identifier_cipher",'RECEIVING_IDENTITY_IMMUTABLE'));
  await trigger('wf_receiving_delete','BEFORE DELETE','manual_receiving_accounts',"SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DEACTIVATE_INSTEAD';");
  await trigger('wf_journal_insert','BEFORE INSERT','wallet_journal',reject("NOT EXISTS(SELECT 1 FROM wallet_operations o WHERE o.id=NEW.operation_id AND o.environment='DEMO' AND o.currency=NEW.currency AND o.amount=NEW.amount)",'LIVE_RAIL_UNAVAILABLE'));
  await trigger('wf_event_insert','BEFORE INSERT','wallet_operation_events',reject("NOT EXISTS(SELECT 1 FROM wallet_operations o JOIN users u ON u.id=NEW.actor_id WHERE o.id=NEW.operation_id AND o.environment=IF(u.is_demo=1,'DEMO','LIVE'))",'ENVIRONMENT_MISMATCH'));
  for(const table of ['wallet_journal','wallet_operation_events']) {
    await trigger(`wf_${table}_update`,'BEFORE UPDATE',table,"SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FINANCIAL_HISTORY_IMMUTABLE';");
    await trigger(`wf_${table}_delete`,'BEFORE DELETE',table,reject("EXISTS(SELECT 1 FROM wallet_operations o WHERE o.id=OLD.operation_id AND o.environment='LIVE')",'FINANCIAL_HISTORY_IMMUTABLE'));
  }
  await trigger('wf_operation_delete','BEFORE DELETE','wallet_operations',reject("OLD.environment='LIVE'",'FINANCIAL_HISTORY_IMMUTABLE'));
  const beneficiary=reject("NEW.method='INTERNAL' AND NOT EXISTS(SELECT 1 FROM users owner JOIN users recipient ON LOWER(recipient.email)=LOWER(TRIM(NEW.destination)) WHERE owner.id=NEW.user_id AND recipient.id<>owner.id AND owner.is_demo=recipient.is_demo AND recipient.role IN ('STUDENT','PARENT') AND recipient.status='ACTIVE')",'ENVIRONMENT_MISMATCH');
  await trigger('wf_beneficiary_insert','BEFORE INSERT','beneficiaries',beneficiary);
  await trigger('wf_beneficiary_update','BEFORE UPDATE','beneficiaries',reject("NEW.method<>OLD.method OR NEW.destination<>OLD.destination OR NEW.currency<>OLD.currency",'BENEFICIARY_IDENTITY_IMMUTABLE'));
  await trigger('wf_internal_only','BEFORE INSERT','financial_requests',reject("NEW.kind='SEND' AND NEW.method<>'INTERNAL'",'EXTERNAL_SEND_DISABLED'));
  await trigger('wf_family_roles','BEFORE INSERT','family_links',reject("NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.student_id AND role='STUDENT') OR (NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.parent_id AND role='PARENT'))",'FAMILY_ROLE_MISMATCH'));
  await trigger('wf_approval_insert','BEFORE INSERT','wallet_operation_approvals',reject("NOT EXISTS(SELECT 1 FROM wallet_operations o JOIN family_links f ON f.student_id=o.user_id JOIN users p ON p.id=f.parent_id WHERE o.id=NEW.operation_id AND f.parent_id=NEW.parent_id AND f.status='LINKED' AND p.role='PARENT' AND o.environment=IF(p.is_demo=1,'DEMO','LIVE'))",'FAMILY_REQUIRED'));
  const secret=process.env.AI_KEY_ENCRYPTION_SECRET||process.env.SESSION_SECRET;
  if(process.env.DEMO_MODE==='true' && secret?.length>=32) {
    for(const [i,method] of ['UNIONPAY','ALIPAY','BKASH','NAGAD','ROCKET'].entries()) {
      const identifier=method==='UNIONPAY'?'DEMO-UNIONPAY-0000':method==='ALIPAY'?'demo@example.invalid':'01700000000';
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
      const data=Buffer.concat([cipher.update(identifier,'utf8'),cipher.final()]);
      const encrypted=[iv,cipher.getAuthTag(),data].map(v=>v.toString('base64')).join('.');
      await db.execute(`INSERT IGNORE INTO manual_receiving_accounts(id,environment,method,holder,identifier_cipher,currency,instructions,minimum,maximum,active,display_order)
        VALUES (?,'DEMO',?,'SIMULATED — NO REAL MONEY',?,?, 'DEMO sample only. Never send real funds.',1,100000,1,?)`,
        [`00000000-0000-4000-8000-00000000000${i}`,method,encrypted,['UNIONPAY','ALIPAY'].includes(method)?'CNY':'BDT',i]);
    }
  }
}
