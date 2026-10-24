import { readFile } from "node:fs/promises";

export async function migrateBilling(db) {
  await db.query(
    await readFile(
      new URL("../database/provider-checkouts.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.execute(
    "INSERT IGNORE INTO plans(id,name,description_key,limits,display_order) VALUES ('student-free','Student Free','planStudentFree',?,0)",
    [
      JSON.stringify({
        ACCOUNTS: 2,
        AGENT_MESSAGES: 30,
        TRANSFER_SIMULATIONS: 3,
        TUITION_PLANS: 1,
        CSV_IMPORTS: 0,
        PARENT_LINKS: 1,
      }),
    ],
  );
  await db.execute(
    "INSERT IGNORE INTO plan_prices(plan_id,monthly,yearly,currency) VALUES ('student-free',0,0,'BDT')",
  );
  await db.execute("UPDATE plans SET active=0 WHERE id IN ('trial','pro')");
  if (process.env.DEMO_MODE !== "true") return;
  await db.execute(
    "INSERT IGNORE INTO users(id,name,email,password_hash,role,onboarded,is_demo) SELECT 'demo-student-free','Student Free Demo','student-free@finbridge.demo',password_hash,'STUDENT',1,1 FROM users WHERE id='demo-student' AND is_demo=1",
  );
  await db.execute(
    "INSERT IGNORE INTO user_preferences(user_id,language,theme,country_code,preferred_currency,timezone,ai_model_id) SELECT 'demo-student-free',language,theme,country_code,preferred_currency,timezone,ai_model_id FROM user_preferences WHERE user_id='demo-student'",
  );
  await db.execute(
    "INSERT IGNORE INTO student_profiles(user_id,university,home_currency,study_currency,monthly_income,monthly_expenses) SELECT 'demo-student-free',university,home_currency,study_currency,monthly_income,monthly_expenses FROM student_profiles WHERE user_id='demo-student'",
  );
  await db.execute(
    "INSERT IGNORE INTO accounts(id,user_id,name,type,currency,balance) SELECT CONCAT('free-',LEFT(SHA2(id,256),40)),'demo-student-free',name,type,currency,balance FROM accounts WHERE user_id='demo-student' AND archived=0 ORDER BY id LIMIT 2",
  );
  await db.execute(
    "INSERT IGNORE INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) SELECT 'sub-student-free',id,'student-free',UTC_TIMESTAMP(),'2099-12-31' FROM users WHERE id='demo-student-free' AND is_demo=1",
  );
}
