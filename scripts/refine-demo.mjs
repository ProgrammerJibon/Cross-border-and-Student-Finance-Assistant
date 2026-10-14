// Keep sufficient cash for tuition execution while future living obligations create a funding gap.
import mysql from "mysql2/promise";
import { readFile, writeFile } from "node:fs/promises";
process.loadEnvFile(".env.local");
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await db.execute(
  "UPDATE student_profiles SET monthly_expenses=5350 WHERE user_id='demo-student'",
);
await db.execute(
  "UPDATE transactions SET amount=3900*(1+CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(id,'-',2),'-',-1) AS UNSIGNED)*0.035) WHERE user_id='demo-student' AND category='Housing' AND id LIKE 'tx-%'",
);
await db.execute(
  "UPDATE budgets SET amount=3950 WHERE user_id='demo-student' AND category='Housing'",
);
await db.end();
let seed = await readFile("scripts/generate-demo.mjs", "utf8");
seed = seed
  .replace("'1850','1275'", "'1850','5350'")
  .replace("'Campus residence',900", "'Campus residence',3900")
  .replace("['Housing',950]", "['Housing',3950]");
await writeFile("scripts/generate-demo.mjs", seed);
