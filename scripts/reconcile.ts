import { reconcileFinancialIntegrity } from "../src/services/reconciliation.service";
import { pool } from "../src/lib/db";
try {
  const result=await reconcileFinancialIntegrity();
  console.log(JSON.stringify(result));
  if(result.discrepancies) process.exitCode=2;
} finally { await pool.end(); }
