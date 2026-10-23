import mysql from "mysql2/promise";
import { pathToFileURL } from "node:url";
import { migratePlatform } from "./platform-migration.mjs";
import { migratePayments } from "./payment-migration.mjs";
import { migrateAgent } from "./agent-migration.mjs";

export async function migrate(db) {
  await migratePlatform(db);
  await migratePayments(db);
  await migrateAgent(db);
  await db.execute(
    `CREATE TABLE IF NOT EXISTS notification_subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      endpoint VARCHAR(1000) NOT NULL,
      expiration_time BIGINT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_endpoint (user_id, endpoint(255)),
      INDEX idx_user (user_id)
    )`,
  );
  const [columns] = await db.execute(
    "SELECT DATETIME_PRECISION precision_value FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fx_rates' AND COLUMN_NAME='recorded_at'",
  );
  if (Number(columns[0]?.precision_value) !== 6) {
    await db.execute(
      "ALTER TABLE fx_rates MODIFY recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
    );
  }
}

// Re-runnable, additive illustration data. Never replaces configured current rates.
export async function seedFxHistory(db) {
  const [rates] = await db.execute(
    "SELECT currency,rate,recorded_at FROM (SELECT currency,rate,recorded_at,ROW_NUMBER() OVER (PARTITION BY currency ORDER BY recorded_at DESC,id DESC) rn FROM fx_rates) r WHERE rn=1",
  );
  for (const [index, row] of rates.entries()) {
    for (let day = 1; day <= 29; day++) {
      const rate =
        row.currency === "CAD"
          ? 1
          : Number(row.rate) *
            (1 + Math.sin(day / 5 + index) * 0.009 - day * 0.0003);
      await db.execute(
        "INSERT IGNORE INTO fx_rates(id,currency,rate,recorded_at) VALUES (?,?,?,DATE_SUB(?,INTERVAL ? DAY))",
        [
          `history-${row.currency}-${day}`,
          row.currency,
          rate.toFixed(8),
          row.recorded_at,
          day,
        ],
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.loadEnvFile(".env.local");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
  });
  try {
    await db.query("SET time_zone = '+00:00'");
    await migrate(db);
    if (process.env.DEMO_MODE === "true") await seedFxHistory(db);
    console.log(
      "Applied additive migrations and sandbox history (when demo mode is enabled).",
    );
  } finally {
    await db.end();
  }
}
