export async function migrateCommerce(db) {
  for (const [table, column, definition] of [
    ["subscriptions", "extra_seats", "INT NOT NULL DEFAULT 0"],
    ["provider_checkouts", "environment", "VARCHAR(10) NOT NULL DEFAULT 'sandbox'"],
    ["provider_checkouts", "purpose", "VARCHAR(16) NOT NULL DEFAULT 'PLAN'"],
    ["provider_checkouts", "request_id", "VARCHAR(64) NULL"],
    ["provider_checkouts", "extra_seats", "INT NOT NULL DEFAULT 0"],
    ["provider_checkouts", "recurring", "BOOLEAN NOT NULL DEFAULT 0"],
    ["provider_checkouts", "subscription_id", "VARCHAR(255) NULL"],
    ["provider_checkouts", "renewal_status", "VARCHAR(20) NULL"],
  ]) {
    const [found] = await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", [table, column]);
    if (!found.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS payment_gateway_config (
    environment VARCHAR(10) PRIMARY KEY, config_cipher TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS provider_renewals (
    provider VARCHAR(16) NOT NULL, environment VARCHAR(10) NOT NULL,
    receipt VARCHAR(255) NOT NULL, checkout_id VARCHAR(64) NOT NULL,
    paid_until DATETIME NOT NULL, PRIMARY KEY(provider,environment,receipt)
  )`);
  const [done] = await db.execute("SELECT id FROM platform_migrations WHERE id='commerce-plans-v2'");
  if (!done.length) {
    const pro = { ACCOUNTS: 100, AGENT_MESSAGES: 3000, TRANSFER_SIMULATIONS: 1000, TUITION_PLANS: 100, CSV_IMPORTS: 100, PARENT_LINKS: 1, BENEFICIARIES: 1000, BUDGETS: 1000 };
    for (const [id, name, price, limits, order] of [
      ["student-free", "Student Free", 0, { ACCOUNTS: 2, AGENT_MESSAGES: 30, TRANSFER_SIMULATIONS: 3, TUITION_PLANS: 0, CSV_IMPORTS: 0, PARENT_LINKS: 1, BENEFICIARIES: 3, BUDGETS: 3 }, 0],
      ["student", "Student Pro", 299, pro, 1],
      ["family", "Family Lite", 999, { ...pro, PARENT_LINKS: 10 }, 2],
      ["family-pro", "Family Pro", 1499, { ...pro, PARENT_LINKS: 20 }, 3],
    ]) {
      await db.execute("INSERT INTO plans(id,name,description_key,limits,display_order,active) VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),description_key=VALUES(description_key),limits=VALUES(limits),display_order=VALUES(display_order),active=1", [id,name,`plan-${id}`,JSON.stringify(limits),order]);
      await db.execute("INSERT INTO plan_prices(plan_id,monthly,yearly,currency) VALUES (?,?,?,'BDT') ON DUPLICATE KEY UPDATE monthly=VALUES(monthly),yearly=VALUES(yearly),currency='BDT'", [id,price,price*12]);
    }
    await db.execute("INSERT INTO platform_migrations(id) VALUES ('commerce-plans-v2')");
  }
  await db.execute("INSERT IGNORE INTO payment_methods(code,name,active,deposit_enabled,withdrawal_enabled,currencies,instructions) SELECT 'STRIPE','Stripe',1,1,0,currencies,'Hosted card checkout by Stripe' FROM payment_methods WHERE code='UNIONPAY'");
  await db.execute("UPDATE payment_methods SET active=1,deposit_enabled=1 WHERE code IN ('UNIONPAY','PAYPAL','ALIPAY','WECHAT')");
  if (process.env.DEMO_MODE === "true") {
    for (const [id, name, role, plan, source] of [
      ["demo-student-free", "Student Free Demo", "STUDENT", "student-free", "demo-student"],
      ["demo-student", "Student Pro Demo", "STUDENT", "student", "demo-student"],
      ["demo-parent", "Family Lite Demo", "PARENT", "family", "demo-parent"],
      ["demo-parent-pro", "Family Pro Demo", "PARENT", "family-pro", "demo-parent"],
    ]) {
      await db.execute("INSERT IGNORE INTO users(id,name,email,password_hash,role,onboarded,is_demo) SELECT ?,?,CONCAT(?,'@finbridge.demo'),password_hash,?,1,1 FROM users WHERE id=? AND is_demo=1",[id,name,id,role,source]);
      await db.execute("INSERT IGNORE INTO user_preferences(user_id,language,theme,country_code,preferred_currency,timezone) VALUES (?,'en','light','BD','BDT','Asia/Dhaka')",[id]);
      await db.execute("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,?,UTC_TIMESTAMP(),'2099-12-31') ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status='ACTIVE',ends_at='2099-12-31'",[`sub-${id}`,id,plan]);
      if(role==='STUDENT') await db.execute("INSERT IGNORE INTO student_profiles(user_id) VALUES (?)",[id]);
      await db.execute("INSERT IGNORE INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'RMB wallet','BANK','CNY',5000),(?,?,'BDT wallet','BANK','BDT',25000)", [`${id}-cny`,id,`${id}-bdt`,id]);
    }
  }
}
