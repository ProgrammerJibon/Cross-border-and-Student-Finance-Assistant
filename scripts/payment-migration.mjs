import { readFile } from "node:fs/promises";
export async function migratePayments(db) {
  for (const sql of (
    await readFile(new URL("../database/payments.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  for (const [column, definition] of [
    ["allow_non_beneficiary", "BOOLEAN NOT NULL DEFAULT 0"],
    ["non_beneficiary_limit", "DECIMAL(18,2) NOT NULL DEFAULT 0"],
  ]) {
    const [r] = await db.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='parental_controls' AND COLUMN_NAME=?",
      [column],
    );
    if (!r.length)
      await db.query(
        `ALTER TABLE parental_controls ADD COLUMN ${column} ${definition}`,
      );
  }
  for (const table of [
    "agent_tool_calls",
    "financial_events",
    "subscription_events",
  ]) {
    const [columns] = await db.execute(
      "SELECT DATETIME_PRECISION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='created_at'",
      [table],
    );
    if (Number(columns[0]?.DATETIME_PRECISION) !== 6)
      await db.query(
        `ALTER TABLE ${table} MODIFY created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
      );
  }
  const methods = [
    ["INTERNAL", "FinBridge wallet"],
    ["CARD", "Demo card"],
    ["BANK", "Bank / wire transfer"],
    ["PAYPAL", "PayPal"],
    ["ALIPAY", "Alipay"],
    ["WECHAT", "WeChat Pay"],
    ["UNIONPAY", "UnionPay"],
  ];
  for (const [code, name] of methods)
    await db.execute(
      "INSERT IGNORE INTO payment_methods(code,name,active,deposit_enabled,withdrawal_enabled,instructions,currencies) VALUES (?,?,?,?,?,?,?)",
      [
        code,
        name,
        process.env.DEMO_MODE === "true" || ["CARD", "INTERNAL"].includes(code)
          ? 1
          : 0,
        code !== "INTERNAL",
        !["CARD", "INTERNAL"].includes(code),
        ["CARD", "INTERNAL"].includes(code)
          ? "Sandbox only."
          : `DEMO ONLY — ${name}. Platform account: FINBRIDGE-DEMO-${code}. Reference your request ID. Do not send real money.`,
        JSON.stringify(["CNY", "BDT", "USD", "EUR", "GBP", "CAD"]),
      ],
    );
  if (process.env.DEMO_MODE === "true")
    await db.execute(
      "INSERT IGNORE INTO accounts(id,user_id,name,type,currency,balance) SELECT 'demo-parent-cny',id,'Family RMB wallet','WALLET','CNY',25000 FROM users WHERE id='demo-parent'",
    );
}
