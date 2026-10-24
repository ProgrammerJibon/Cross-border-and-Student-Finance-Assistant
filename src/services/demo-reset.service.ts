import "server-only";
import { atomic, rows, write } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
let lastCheckTime = 0;

export async function checkAndAutoResetDemo(): Promise<boolean> {
  if (process.env.DEMO_MODE !== "true") return false;
  const now = Date.now();
  if (now - lastCheckTime < 60 * 1000) return false;
  lastCheckTime = now;
  try {
    await write(
      "CREATE TABLE IF NOT EXISTS demo_auto_resets (id INT PRIMARY KEY, last_reset_at BIGINT NOT NULL)"
    );
    const [record] = await rows<{ last_reset_at: number }>(
      "SELECT last_reset_at FROM demo_auto_resets WHERE id = 1"
    );
    if (!record || now - Number(record.last_reset_at) >= TWENTY_FOUR_HOURS_MS) {
      await resetDemoData("system");
      await write(
        "INSERT INTO demo_auto_resets (id, last_reset_at) VALUES (1, ?) ON DUPLICATE KEY UPDATE last_reset_at = VALUES(last_reset_at)",
        [now]
      );
      return true;
    }
  } catch (err) {
    // Graceful error ignore on concurrent or offline access
  }
  return false;
}

if (typeof setInterval !== "undefined" && process.env.DEMO_MODE === "true") {
  const timer = setInterval(() => {
    void checkAndAutoResetDemo();
  }, 60 * 60 * 1000);
  if (timer.unref) timer.unref();
}

export async function resetDemoData(actorId: string) {
  requireCondition(process.env.DEMO_MODE === "true","FORBIDDEN");
  return atomic(async db => {
    const users=await rows<{id:string;role:string}>("SELECT id,role FROM users WHERE is_demo=1 ORDER BY id FOR UPDATE",[],db);
    requireCondition(users.length>0,"NOT_FOUND");
    // A reset never modifies identities, API models, credentials or global settings.
    const ids=users.map(u=>u.id);
    const scope=ids.map(()=>"?").join(",");
    const owns=`user_id IN (${scope})`;
    const runs=`SELECT id FROM agent_runs WHERE ${owns}`;
    const requests=`SELECT id FROM financial_requests WHERE ${owns}`;
    const transfers=`SELECT id FROM sandbox_transfers WHERE ${owns}`;
    const links=`SELECT id FROM family_links WHERE student_id IN (${scope}) OR parent_id IN (${scope})`;
    // Refuse to reset an in-flight AI run or records connected to real users.
    requireCondition(!(await rows(`SELECT id FROM agent_runs WHERE ${owns} AND status IN ('PENDING','RUNNING')`,ids,db)).length,"DEMO_RESET_BUSY");
    requireCondition(!(await rows(`SELECT f.id FROM family_links f JOIN users s ON s.id=f.student_id JOIN users p ON p.id=f.parent_id WHERE s.is_demo<>p.is_demo AND (s.is_demo=1 OR p.is_demo=1)`,[],db)).length,"DEMO_RESET_UNSAFE");
    requireCondition(!(await rows("SELECT r.id FROM financial_requests r JOIN users u ON u.id=r.user_id JOIN users v ON v.id=r.recipient_user_id WHERE u.is_demo<>v.is_demo",[],db)).length,"DEMO_RESET_UNSAFE");
    for(const [table,condition,values] of [
      ["provider_renewals",`checkout_id IN (SELECT id FROM provider_checkouts WHERE ${owns})`,ids],
      ["provider_checkouts",owns,ids],
      ["agent_conversation_turns",`run_id IN (${runs}) OR previous_run_id IN (${runs})`,[...ids,...ids]],
      ["agent_action_requests",owns,ids], ["agent_provider_usage",owns,ids],
      ["agent_messages",`run_id IN (${runs})`,ids], ["agent_tool_calls",`run_id IN (${runs})`,ids],
      ["agent_runs",owns,ids], ["agent_conversations",owns,ids],
      ["financial_approvals",`request_id IN (${requests})`,ids],
      ["financial_events",`request_id IN (${requests})`,ids],
      ["financial_ledger_entries",`request_id IN (${requests})`,ids],
      ["financial_requests",owns,ids],
      ["beneficiary_decisions",`beneficiary_id IN (SELECT id FROM beneficiaries WHERE ${owns})`,ids],
      ["beneficiaries",owns,ids],
      ["parent_approvals",`transfer_id IN (${transfers})`,ids],
      ["approval_requests",`transfer_id IN (${transfers})`,ids],
      ["sandbox_ledger_entries",`transfer_id IN (${transfers})`,ids],
      ["sandbox_transfers",owns,ids], ["transfer_quotes",owns,ids],
      ["parental_controls",`link_id IN (${links})`,[...ids,...ids]],
      ["family_links",`student_id IN (${scope}) OR parent_id IN (${scope})`,[...ids,...ids]],
      ["budget_categories",`budget_id IN (SELECT id FROM budgets WHERE ${owns})`,ids],
      ["budgets",owns,ids], ["tuition_plans",owns,ids], ["tuition_invoices",owns,ids],
      ["generated_alerts",owns,ids], ["alerts",owns,ids], ["notifications",owns,ids],
      ["notification_subscriptions",owns,ids], ["notification_devices",owns,ids],
      ["transactions",owns,ids], ["accounts",owns,ids], ["financial_goals",owns,ids],
      ["usage_counters",owns,ids], ["demo_payments",owns,ids], ["subscription_events",owns,ids],
      ["reports",owns,ids], ["credit_tasks",owns,ids], ["credit_profiles",owns,ids],
      ["risk_assessments",owns,ids], ["saved_cards",owns,ids], ["password_resets",owns,ids],
      ["audit_logs",`actor_id IN (${scope})`,ids],
    ] as [string,string,string[]][]) await write(`DELETE FROM ${table} WHERE ${condition}`,values,db);
    await write(`UPDATE users SET status='ACTIVE',onboarded=1 WHERE id IN (${scope})`,ids,db);
    await write(`UPDATE user_preferences SET language='en',theme='light',country_code='BD',preferred_currency='BDT',timezone='Asia/Dhaka',notifications=1,auto_alerts=0 WHERE user_id IN (${scope})`,ids,db);
    for(const u of users) {
      if(!["STUDENT","PARENT"].includes(u.role)) continue;
      const plan=u.role==="PARENT"?(u.id==="demo-parent-pro"?"family-pro":"family"):(u.id==="demo-student-free"?"student-free":"student");
      await write("UPDATE subscriptions SET plan_id=?,status='ACTIVE',ends_at='2099-12-31',extra_seats=0 WHERE user_id=?",[plan,u.id],db);
      for(const [currency,balance] of [["CNY",5000],["BDT",25000]] as const) await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,?,'BANK',?,?)",[`${u.id}-${currency}`,u.id,`${currency} wallet`,currency,balance],db);
      if(u.role==="STUDENT") {
        await write("UPDATE student_profiles SET university='Demo University',monthly_income=6000,monthly_expenses=3500,home_currency='BDT',study_currency='CNY',goals='[]' WHERE user_id=?",[u.id],db);
        await write("INSERT INTO budgets(id,user_id,category,amount,currency,month) VALUES (?,?,'Food',1000,'CNY',DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m'))",[`${u.id}-food`,u.id],db);
      }
    }
    await audit(actorId,"DEMO_RESET","users","demo",{},db);
    return {reset:users.length};
  });
}
