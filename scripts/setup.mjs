import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { migrate, seedFxHistory } from "./migrate.mjs";
process.loadEnvFile(".env.local");
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  dateStrings: true,
});
await db.query("SET time_zone = '+00:00'");
for (const file of ["schema.sql", "seed.sql"]) {
  await db.query(await readFile(resolve("database", file), "utf8"));
  console.log("Imported", file);
}
await migrate(db);
if (process.env.DEMO_MODE === "true") await seedFxHistory(db);
await db.end();
