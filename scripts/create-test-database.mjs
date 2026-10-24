import mysql from "mysql2/promise";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { migrate } from "./migrate.mjs";
try { process.loadEnvFile(".env.local"); } catch { /* CI supplies environment. */ }
const name = `finbridge_test_${Date.now()}`;
if (!["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)) throw new Error("Test provisioning requires a local database");
const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true});
try {
  await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await db.query(`USE ${name}`);
  await db.query("SET time_zone='+00:00'");
  for (const file of ["schema.sql", "seed.sql"]) await db.query(await readFile(new URL(`../database/${file}`,import.meta.url),"utf8"));
  // Historical Live amounts must be quarantined, not destroyed or certified.
  await db.execute("INSERT INTO users(id,name,email,password_hash,role) VALUES ('legacy-test','Legacy fixture','legacy@example.test','unused','STUDENT')");
  await db.execute("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES ('legacy-wallet','legacy-test','Legacy','BANK','USD',125)");
  await db.execute("INSERT INTO financial_requests(id,user_id,account_id,kind,method,amount,currency,recipient,destination,receive_amount,receive_currency,fx_rate,status,idempotency_key) VALUES ('legacy-request','legacy-test','legacy-wallet','TOPUP','BANK',10,'USD','','',10,'USD',1,'PROCESSING','legacy-request')");
  process.env.DEMO_MODE="true";
  await migrate(db);
  await migrate(db);
  const [legacy] = await db.execute("SELECT balance,legacy_unverified_balance FROM accounts WHERE id='legacy-wallet'");
  if (Number(legacy[0].balance)!==0 || Number(legacy[0].legacy_unverified_balance)!==125) throw new Error("Migration preservation failed");
  await mkdir(".local",{recursive:true});
  await writeFile(".local/test-database.json",JSON.stringify({database:name}));
  console.log(`Isolated database ${name} ready; migration replay and legacy preservation passed.`);
} finally { await db.end(); }
