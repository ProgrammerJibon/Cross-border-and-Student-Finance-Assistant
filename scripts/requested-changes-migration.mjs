export async function migrateRequestedChanges(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS provider_topup_receipts (
    processor VARCHAR(16) NOT NULL, environment VARCHAR(10) NOT NULL, receipt VARCHAR(255) NOT NULL,
    checkout_id VARCHAR(64) NOT NULL UNIQUE, PRIMARY KEY(processor,environment,receipt),
    FOREIGN KEY(checkout_id) REFERENCES provider_checkouts(id) ON DELETE CASCADE
  )`);
  await db.query(`INSERT IGNORE INTO provider_topup_receipts(processor,environment,receipt,checkout_id)
    SELECT IF(provider='PAYPAL','PAYPAL','STRIPE'),environment,receipt,id FROM provider_checkouts
    WHERE purpose='TOPUP' AND status='COMPLETED' AND receipt IS NOT NULL`);
  const columns = {
    programme: "VARCHAR(160) NOT NULL DEFAULT ''",
    funding_needs: "DECIMAL(18,2) NOT NULL DEFAULT 0",
    payment_schedule: "VARCHAR(12) NOT NULL DEFAULT 'ONE_OFF'",
    first_due_date: "DATE NULL",
    installments: "INT NOT NULL DEFAULT 1",
  };
  for (const [name, definition] of Object.entries(columns)) {
    const [found] = await db.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tuition_invoices' AND COLUMN_NAME=?", [name]);
    if (!found.length) await db.query(`ALTER TABLE tuition_invoices ADD COLUMN ${name} ${definition}`);
  }
  await db.query("UPDATE tuition_invoices SET first_due_date=due_date WHERE first_due_date IS NULL");
  await db.query(`CREATE TABLE IF NOT EXISTS budget_records (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, account_id VARCHAR(64) NOT NULL,
    amount DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL, type VARCHAR(10) NOT NULL,
    category VARCHAR(40) NOT NULL, description VARCHAR(160) NOT NULL, notes VARCHAR(500) NOT NULL DEFAULT '',
    date DATE NOT NULL, confidence DECIMAL(5,2) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(user_id,date), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(account_id) REFERENCES accounts(id), CHECK(amount>0), CHECK(type IN ('INCOME','EXPENSE'))
  )`);
  await db.query(`CREATE OR REPLACE VIEW finance_records AS
    SELECT id,user_id,account_id,amount,currency,type,category,description,notes,date,confidence,created_at,_utf8mb4'LEDGER' COLLATE utf8mb4_unicode_ci record_source FROM transactions
    UNION ALL
    SELECT id,user_id,account_id,amount,currency,type,category,description,notes,date,confidence,created_at,_utf8mb4'BUDGET' COLLATE utf8mb4_unicode_ci record_source FROM budget_records`);
}
