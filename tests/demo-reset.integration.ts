import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
process.loadEnvFile(".env.local");
const {rows,write,pool}=await import("../src/lib/db");
const {resetDemoData}=await import("../src/services/demo-reset.service");
test("demo reset restores tier defaults and preserves every stored API credential",async()=>{
  const digest=async()=>createHash("sha256").update(JSON.stringify([
    await rows("SELECT * FROM ai_models ORDER BY id"),
    await rows("SELECT * FROM payment_gateway_config ORDER BY environment"),
    await rows("SELECT * FROM admin_settings ORDER BY name"),
  ])).digest("hex");
  try {
    const before=await digest();
    await write("INSERT INTO usage_counters(user_id,feature,period,used) VALUES ('demo-student-free','AGENT_MESSAGES',DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m'),999) ON DUPLICATE KEY UPDATE used=999");
    await write("UPDATE accounts SET balance=999999 WHERE user_id='demo-student-free'");
    await resetDemoData("demo-admin");
    assert.equal(await digest(),before);
    assert.equal((await rows("SELECT * FROM usage_counters WHERE user_id='demo-student-free'")).length,0);
    assert.equal((await rows("SELECT * FROM accounts WHERE user_id='demo-student-free'")).length,2);
    assert.equal((await rows("SELECT balance FROM accounts WHERE user_id='demo-student-free' AND currency='CNY'"))[0].balance,"5000.00");
    assert.equal((await rows("SELECT plan_id FROM subscriptions WHERE user_id='demo-student'"))[0].plan_id,"student");
    assert.equal((await rows("SELECT plan_id FROM subscriptions WHERE user_id='demo-parent-pro'"))[0].plan_id,"family-pro");
  } finally {await pool.end();}
});
