import bcrypt from "bcryptjs";
import { writeFile } from "node:fs/promises";
const hash = await bcrypt.hash("DemoOnly!2026", 12);
const sql = [];
const quote = (v) =>
  v === null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
const insert = (table, columns, values) =>
  sql.push(
    `INSERT IGNORE INTO ${table} (${columns}) VALUES (${values.map(quote).join(",")});`,
  );
for (const [id, name, email, role, plan] of [
  ["demo-student", "Aarav Rahman", "student@finbridge.demo", "STUDENT", "pro"],
  ["demo-parent", "Nadia Rahman", "parent@finbridge.demo", "PARENT", "family"],
  ["demo-admin", "Demo Administrator", "admin@finbridge.demo", "ADMIN", "pro"],
]) {
  insert("users", "id,name,email,password_hash,role,onboarded,is_demo", [
    id,
    name,
    email,
    hash,
    role,
    1,
    1,
  ]);
  insert(
    "user_preferences",
    "user_id,language,theme,preferred_currency,timezone",
    [id, "en", "light", "CAD", "Asia/Dhaka"],
  );
  sql.push(
    `INSERT IGNORE INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES ('sub-${id}','${id}','${plan}',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR));`,
  );
}
insert(
  "student_profiles",
  "user_id,birth_date,university,monthly_income,monthly_expenses,goals",
  [
    "demo-student",
    "2003-04-12",
    "University of Toronto",
    "1850",
    "5350",
    '["tuition","transfers","budget"]',
  ],
);
for (const [id, name, type, currency, balance] of [
  ["acc-bdt", "Home savings", "SAVINGS", "BDT", "780000"],
  ["acc-cad", "Student checking", "BANK", "CAD", "3240"],
  ["acc-usd", "Travel wallet", "WALLET", "USD", "420"],
])
  insert("accounts", "id,user_id,name,type,currency,balance", [
    id,
    "demo-student",
    name,
    type,
    currency,
    balance,
  ]);
sql.push(
  "INSERT IGNORE INTO tuition_invoices(id,user_id,name,amount,paid,scholarship,currency,due_date,semester) VALUES ('tuition-fall','demo-student','University of Toronto',8000,0,1000,'CAD',DATE_ADD(CURDATE(),INTERVAL 34 DAY),'Winter 2027');",
);
const expenses = [
  ["Housing", "Campus residence", 3900],
  ["Food", "Fresh market", 68.4],
  ["Transport", "PRESTO transit", 52],
  ["Food", "Campus café", 14.75],
  ["Education", "University bookstore", 86],
  ["Shopping", "Winter essentials", 124.9],
  ["Utilities", "Mobile plan", 35],
  ["Health", "Student pharmacy", 24],
  ["Food", "Groceries", 82.3],
  ["Other", "Student society", 15],
];
for (let month = 0; month < 6; month++) {
  for (let i = 0; i < expenses.length; i++) {
    const [cat, description, base] = expenses[i];
    sql.push(
      `INSERT IGNORE INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date,confidence) VALUES ('tx-${month}-${i}','demo-student','acc-cad',${(base * (1 + month * 0.035)).toFixed(2)},'CAD','EXPENSE','${cat}','${description}',DATE_SUB(DATE_SUB(CURDATE(),INTERVAL ${month} MONTH),INTERVAL ${i % 10} DAY),0.96);`,
    );
  }
  sql.push(
    `INSERT IGNORE INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date) VALUES ('income-${month}','demo-student','acc-cad',1850,'CAD','INCOME','Income','Campus assistantship',DATE_SUB(CURDATE(),INTERVAL ${month} MONTH));`,
  );
}
for (const [category, amount] of [
  ["Housing", 3950],
  ["Food", 320],
  ["Transport", 100],
  ["Education", 150],
  ["Shopping", 120],
  ["Utilities", 80],
  ["Health", 60],
  ["Other", 70],
])
  sql.push(
    `INSERT IGNORE INTO budgets(id,user_id,category,amount,currency,month) VALUES ('budget-${category}','demo-student','${category}',${amount},'CAD',DATE_FORMAT(CURDATE(),'%Y-%m'));`,
  );
insert(
  "family_links",
  "id,student_id,parent_id,invite_email,status,visibility",
  [
    "demo-family",
    "demo-student",
    "demo-parent",
    "parent@finbridge.demo",
    "LINKED",
    '{"balances":true,"categories":true,"descriptions":false,"tuition":true,"budgets":true}',
  ],
);
insert(
  "parental_controls",
  "link_id,threshold,per_transfer,daily_limit,monthly_limit",
  ["demo-family", 500, 10000, 15000, 25000],
);
for (const [type, severity, detail] of [
  ["TUITION", "WARNING", "tuitionApproaching"],
  ["BUDGET", "WARNING", "shoppingBudget"],
  ["FX", "INFO", "favorableRate"],
])
  insert("alerts", "id,user_id,type,severity,detail", [
    `alert-${type}`,
    "demo-student",
    type,
    severity,
    detail,
  ]);
insert("notifications", "id,user_id,type,detail", [
  "welcome",
  "demo-student",
  "WELCOME",
  "welcomeNotice",
]);
for (const task of [
  "creditReminders",
  "creditUtilization",
  "creditHistory",
  "creditReport",
])
  insert("credit_tasks", "id,user_id,task_key,completed", [
    `credit-${task}`,
    "demo-student",
    task,
    task === "creditReminders" ? 1 : 0,
  ]);
insert("credit_profiles", "user_id,utilization,age_months,overdue,on_time", [
  "demo-student",
  22,
  7,
  0,
  7,
]);
insert("agent_runs", "id,user_id,goal,status,provider,result", [
  "demo-run",
  "demo-student",
  "Can I afford next semester?",
  "COMPLETED",
  "mock",
  '{"summaryKey":"fundingExplanation","kind":"tuition"}',
]);
for (const tool of ["getStudentProfile", "getAccounts", "calculateTuitionGap"])
  insert("agent_tool_calls", "id,run_id,name,input,output,status", [
    `demo-${tool}`,
    "demo-run",
    tool,
    "{}",
    '{"seededExample":true}',
    "SUCCESS",
  ]);
insert("audit_logs", "id,actor_id,action,entity_type,entity_id,metadata", [
  "demo-audit",
  "demo-student",
  "DEMO_DATA_SEEDED",
  "users",
  "demo-student",
  '{"sandbox":true}',
]);
insert("usage_counters", "user_id,feature,period,used", [
  "demo-student",
  "AGENT_MESSAGES",
  new Date().toISOString().slice(0, 7),
  1,
]);
await writeFile(
  "database/demo-data.sql",
  "-- Development only. Demo password: DemoOnly!2026. CHANGE DEMO CREDENTIALS BEFORE DEPLOYMENT.\n" +
    sql.join("\n") +
    "\n",
);
