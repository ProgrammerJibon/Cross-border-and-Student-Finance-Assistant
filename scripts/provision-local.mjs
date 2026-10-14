// Local development bootstrap. Uses the existing XAMPP server; creates only this project's database/user.
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
try {
  await access(".env.local");
  console.log(".env.local already exists; nothing changed.");
  process.exit(0);
} catch {}
const password = randomBytes(24).toString("hex");
const db = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: process.env.MYSQL_ROOT_PASSWORD || "",
});
await db.query(
  "CREATE DATABASE IF NOT EXISTS finbridge_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
);
await db.query(
  "CREATE USER IF NOT EXISTS 'finbridge'@'localhost' IDENTIFIED BY ?",
  [password],
);
await db.query("ALTER USER 'finbridge'@'localhost' IDENTIFIED BY ?", [
  password,
]);
await db.query(
  "GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON finbridge_ai.* TO 'finbridge'@'localhost'",
);
await db.end();
await writeFile(
  ".env.local",
  `APP_URL=http://localhost:3000\nNEXT_PUBLIC_APP_NAME=FinBridge AI\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=finbridge_ai\nDB_USER=finbridge\nDB_PASSWORD=${password}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nAI_MODE=mock\nOPENAI_API_KEY=\nOPENAI_MODEL=\nDEMO_MODE=true\n`,
);
console.log("Local project database and ignored environment file ready.");
