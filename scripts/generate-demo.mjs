import bcrypt from "bcryptjs";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

async function generateSeed() {
  const hash = await bcrypt.hash("DemoOnly!2026", 12);
  const sql = [];

  const quote = (v) =>
    v === null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;

  const insert = (table, columns, values) =>
    sql.push(
      `INSERT IGNORE INTO ${table} (${columns}) VALUES (${values.map(quote).join(",")});`,
    );

  sql.push("-- Base & Reference Data");

  // 1. Currencies & Countries
  const groups = {
    CNY: [5.21, "CN"],
    BDT: [88.5, "BD"],
    USD: [0.735, "US EC SV PA TL MH FM PW"],
    EUR: [
      0.68,
      "DE FR IT ES PT NL BE AT IE FI GR CY MT LU EE LV LT SK SI HR AD MC SM VA",
    ],
    GBP: [0.57, "GB"],
    CAD: [1, "CA"],
    AUD: [1.1, "AU NR TV KI"],
    JPY: [109.2, "JP"],
    INR: [61.5, "IN"],
    AED: [2.7, "AE"],
    SAR: [2.76, "SA"],
    PKR: [205, "PK"],
    NPR: [98.4, "NP"],
    LKR: [220, "LK"],
    BTN: [61.5, "BT"],
    MVR: [11.3, "MV"],
    MYR: [3.2, "MY"],
    SGD: [0.98, "SG"],
    THB: [25, "TH"],
    IDR: [11500, "ID"],
    VND: [18000, "VN"],
    PHP: [42, "PH"],
    KRW: [980, "KR"],
    HKD: [5.73, "HK"],
    TWD: [23.5, "TW"],
    MOP: [5.9, "MO"],
    NZD: [1.2, "NZ CK NU"],
    CHF: [0.65, "CH LI"],
    SEK: [7.5, "SE"],
    NOK: [7.8, "NO"],
    DKK: [5.1, "DK"],
    PLN: [2.9, "PL"],
    CZK: [17, "CZ"],
    HUF: [267, "HU"],
    RON: [3.4, "RO"],
    BGN: [1.33, "BG"],
    TRY: [25, "TR"],
    RUB: [68, "RU"],
    UAH: [30, "UA"],
    GEL: [2, "GE"],
    AMD: [285, "AM"],
    AZN: [1.25, "AZ"],
    KZT: [355, "KZ"],
    UZS: [9300, "UZ"],
    KGS: [64, "KG"],
    TJS: [8, "TJ"],
    MNT: [2500, "MN"],
    QAR: [2.68, "QA"],
    KWD: [0.225, "KW"],
    BHD: [0.277, "BH"],
    OMR: [0.283, "OM"],
    JOD: [0.52, "JO"],
    ILS: [2.7, "IL"],
    EGP: [35, "EG"],
    MAD: [7.3, "MA"],
    TND: [2.25, "TN"],
    DZD: [99, "DZ"],
    ZAR: [13.5, "ZA LS NA"],
    NGN: [1100, "NG"],
    KES: [96, "KE"],
    GHS: [11, "GH"],
    TZS: [1900, "TZ"],
    UGX: [2700, "UG"],
    RWF: [1000, "RW"],
    ETB: [90, "ET"],
    XOF: [446, "SN CI BF BJ ML NE TG GW"],
    XAF: [446, "CM GA CG TD CF GQ"],
    MUR: [34, "MU"],
    SCR: [10, "SC"],
    BWP: [10, "BW"],
    ZMW: [20, "ZM"],
    BRL: [4, "BR"],
    MXN: [14, "MX"],
    ARS: [750, "AR"],
    CLP: [680, "CL"],
    COP: [3000, "CO"],
    PEN: [2.75, "PE"],
    UYU: [30, "UY"],
    PYG: [5600, "PY"],
    BOB: [5, "BO"],
    CRC: [380, "CR"],
    GTQ: [5.7, "GT"],
    DOP: [44, "DO"],
    JMD: [115, "JM"],
    TTD: [5, "TT"],
    BBD: [1.47, "BB"],
    BZD: [1.47, "BZ"],
    XCD: [1.98, "AG DM GD KN LC VC"],
    FJD: [1.65, "FJ"],
    WST: [2, "WS"],
    TOP: [1.7, "TO"],
    PGK: [2.9, "PG"],
    SBD: [6.2, "SB"],
    VUV: [87, "VU"],
    KHR: [3000, "KH"],
    LAK: [16000, "LA"],
    MMK: [1500, "MM"],
    BND: [0.98, "BN"],
    NAD: [13.5, "NA"],
    LSL: [13.5, "LS"],
    SZL: [13.5, "SZ"],
    MWK: [1280, "MW"],
    MZN: [47, "MZ"],
    AOA: [680, "AO"],
    CVE: [75, "CV"],
    ISK: [100, "IS"],
    ALL: [68, "AL"],
    BAM: [1.33, "BA"],
    RSD: [80, "RS"],
    MKD: [42, "MK"],
    MDL: [13, "MD"],
  };

  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

  const currencySymbols = {
    BDT: "৳",
    CAD: "$",
    USD: "$",
    GBP: "£",
    EUR: "€",
    CNY: "¥",
    AUD: "$",
    JPY: "¥",
    INR: "₹",
  };

  for (const [code, [rate, countries]] of Object.entries(groups)) {
    const symbol = currencySymbols[code] || code;
    const name = code === "CNY" ? "Chinese yuan (RMB)" : (currencyNames.of(code) || code);
    insert("currencies", "code,name,symbol,active", [code, name, symbol, 1]);
    insert("fx_rates", "id,currency,rate", [`catalog-${code}`, code, rate]);
    for (const country of countries.split(" ")) {
      insert("countries", "code,name,currency_code", [country, names.of(country) || country, code]);
    }
  }

  // 2. Transaction Categories
  const categories = [
    ["Housing", "#197b70"],
    ["Food", "#71b7a5"],
    ["Education", "#b2dfd2"],
    ["Transport", "#daa875"],
    ["Shopping", "#879dc3"],
    ["Utilities", "#b0a0ca"],
    ["Health", "#df9d9b"],
    ["Other", "#b8c4c0"],
    ["Income", "#147d64"],
  ];
  for (const [catName, color] of categories) {
    insert("transaction_categories", "name,color", [catName, color]);
  }

  // 3. Plans & Prices
  const plans = [
    [
      "trial",
      "Free Trial",
      "planTrial",
      7,
      '{"ACCOUNTS":1,"AGENT_MESSAGES":30,"TRANSFER_SIMULATIONS":3,"TUITION_PLANS":1,"CSV_IMPORTS":1,"PARENT_LINKS":1}',
      0,
      1,
      0,
    ],
    [
      "student",
      "Student",
      "planStudent",
      0,
      '{"ACCOUNTS":5,"AGENT_MESSAGES":500,"TRANSFER_SIMULATIONS":30,"TUITION_PLANS":5,"CSV_IMPORTS":10,"PARENT_LINKS":2}',
      1,
      1,
      1,
    ],
    [
      "pro",
      "Pro",
      "planPro",
      0,
      '{"ACCOUNTS":20,"AGENT_MESSAGES":2000,"TRANSFER_SIMULATIONS":100,"TUITION_PLANS":20,"CSV_IMPORTS":50,"PARENT_LINKS":5}',
      0,
      1,
      2,
    ],
    [
      "family",
      "Family",
      "planFamily",
      0,
      '{"ACCOUNTS":20,"AGENT_MESSAGES":2000,"TRANSFER_SIMULATIONS":100,"TUITION_PLANS":20,"CSV_IMPORTS":50,"PARENT_LINKS":10}',
      0,
      1,
      3,
    ],
  ];
  for (const p of plans) {
    insert("plans", "id,name,description_key,trial_days,limits,recommended,active,display_order", p);
  }

  const prices = [
    ["trial", 0, 0, "BDT"],
    ["student", 299, 2990, "BDT"],
    ["pro", 699, 6990, "BDT"],
    ["family", 999, 9990, "BDT"],
  ];
  for (const pr of prices) {
    insert("plan_prices", "plan_id,monthly,yearly,currency", pr);
  }

  // 4. Remittance Providers & Corridors
  const providers = [
    ["student-transfer", "StudentTransfer Demo", 200, 0.002, 0.003, 10, 20000, 2, 98, 1],
    ["globe-send", "GlobeSend Demo", 100, 0.004, 0.005, 10, 25000, 1, 96, 1],
    ["swift-bank", "SwiftBank Demo", 1600, 0.006, 0.012, 100, 50000, 4, 99, 1],
    ["fast-remit", "FastRemit Demo", 400, 0.005, 0.006, 10, 15000, 0, 94, 1],
  ];
  for (const prov of providers) {
    insert(
      "remittance_providers",
      "id,name,base_fee,percentage_fee,spread,minimum,maximum,eta_days,reliability,active",
      prov,
    );
  }
  sql.push(
    "INSERT IGNORE INTO remittance_corridors SELECT CONCAT(p.id,'-',s.code,'-',t.code),p.id,s.code,t.code FROM remittance_providers p CROSS JOIN currencies s CROSS JOIN currencies t WHERE s.code<>t.code;",
  );

  // 5. Admin Settings
  insert("admin_settings", "name,value", [
    "risk",
    '{"dailyCad":15000,"monthlyCad":50000,"frequency":10,"largeCad":5000}',
  ]);
  insert("admin_settings", "name,value", [
    "creditGuidance",
    '{"Canada":["creditReminders","creditUtilization","creditHistory","creditReport"],"default":["creditReminders","creditUtilization","creditHistory","creditReport"]}',
  ]);

  // 6. Payment Methods
  const methods = [
    ["INTERNAL", "FinBridge wallet", 1, 0, "Sandbox only."],
    ["CARD", "Demo card", 1, 0, "Sandbox only."],
    ["BANK", "Bank / wire transfer", 1, 1, "DEMO ONLY — Bank / wire transfer. Platform account: FINBRIDGE-DEMO-BANK. Reference your request ID. Do not send real money."],
    ["PAYPAL", "PayPal", 1, 1, "DEMO ONLY — PayPal. Platform account: FINBRIDGE-DEMO-PAYPAL. Reference your request ID. Do not send real money."],
    ["ALIPAY", "Alipay", 1, 1, "DEMO ONLY — Alipay. Platform account: FINBRIDGE-DEMO-ALIPAY. Reference your request ID. Do not send real money."],
    ["WECHAT", "WeChat Pay", 1, 1, "DEMO ONLY — WeChat Pay. Platform account: FINBRIDGE-DEMO-WECHAT. Reference your request ID. Do not send real money."],
    ["UNIONPAY", "UnionPay", 1, 1, "DEMO ONLY — UnionPay. Platform account: FINBRIDGE-DEMO-UNIONPAY. Reference your request ID. Do not send real money."],
  ];
  for (const [code, name, dep, withdr, instr] of methods) {
    insert(
      "payment_methods",
      "code,name,active,deposit_enabled,withdrawal_enabled,instructions,currencies",
      [
        code,
        name,
        1,
        dep,
        withdr,
        instr,
        JSON.stringify(["CNY", "BDT", "USD", "EUR", "GBP", "CAD"]),
      ],
    );
  }

  // 7. Platform migrations completed markers
  insert("platform_migrations", "id", ["rmb-focus"]);
  insert("platform_migrations", "id", ["rmb-demo-balances"]);
  insert("platform_migrations", "id", ["demo-team-v1"]);

  sql.push("\n-- Demo Users & Profiles");

  // 8. Demo Users (student, parent, admin)
  insert("users", "id,name,email,password_hash,role,status,session_version,onboarded,is_demo,avatar,admin_permissions", [
    "demo-student",
    "Aarav Rahman",
    "student@finbridge.demo",
    hash,
    "STUDENT",
    "ACTIVE",
    1,
    1,
    1,
    null,
    null,
  ]);
  insert("user_preferences", "user_id,country_code,language,theme,preferred_currency,timezone,notifications,auto_alerts", [
    "demo-student",
    "BD",
    "en",
    "light",
    "CNY",
    "Asia/Dhaka",
    1,
    0,
  ]);
  sql.push(
    "INSERT IGNORE INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES ('sub-demo-student','demo-student','pro','ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR));",
  );

  insert("users", "id,name,email,password_hash,role,status,session_version,onboarded,is_demo,avatar,admin_permissions", [
    "demo-parent",
    "Nadia Rahman",
    "parent@finbridge.demo",
    hash,
    "PARENT",
    "ACTIVE",
    1,
    1,
    1,
    null,
    null,
  ]);
  insert("user_preferences", "user_id,country_code,language,theme,preferred_currency,timezone,notifications,auto_alerts", [
    "demo-parent",
    "BD",
    "en",
    "light",
    "CNY",
    "Asia/Dhaka",
    1,
    0,
  ]);
  sql.push(
    "INSERT IGNORE INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES ('sub-demo-parent','demo-parent','family','ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR));",
  );

  insert("users", "id,name,email,password_hash,role,status,session_version,onboarded,is_demo,avatar,admin_permissions", [
    "demo-admin",
    "Demo Administrator",
    "admin@finbridge.demo",
    hash,
    "ADMIN",
    "ACTIVE",
    1,
    1,
    1,
    null,
    null,
  ]);
  insert("user_preferences", "user_id,country_code,language,theme,preferred_currency,timezone,notifications,auto_alerts", [
    "demo-admin",
    "BD",
    "en",
    "light",
    "CNY",
    "Asia/Dhaka",
    1,
    0,
  ]);
  sql.push(
    "INSERT IGNORE INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES ('sub-demo-admin','demo-admin','pro','ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR));",
  );

  // 9. Demo Moderator Team Members with Avatars
  const teamMembers = [
    ["amina", "Amina Rahman (Demo)", "Leadership", "Chief Executive Officer", "AR", "#174a44", ["reports", "team"], 1],
    ["li", "Li Wei (Demo)", "Engineering", "Head of Engineering", "LW", "#385a87", ["agent", "models"], 0],
    ["sadia", "Sadia Ahmed (Demo)", "Student Experience", "Student Support Lead", "SA", "#896049", ["users", "reports"], 0],
    ["chen", "Chen Lin (Demo)", "Finance Operations", "Finance Operations Lead", "CL", "#6a598b", ["finance", "catalog"], 0],
  ];

  for (const [index, [slug, name, dept, desig, initials, color, perms, isCeo]] of teamMembers.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="${color}"/><circle cx="400" cy="20" r="140" fill="white" opacity=".08"/><circle cx="240" cy="119" r="51" fill="#e6c3a8"/><path d="M187 108c0-78 115-78 106 8-25-10-44-20-65-40-11 19-23 28-41 32" fill="#263536"/><path d="M129 300v-35c0-88 222-88 222 0v35" fill="#d6e4df"/><path d="M202 220l38 42 38-42" fill="#abc6bd"/><text x="26" y="42" font-family="Arial,sans-serif" font-size="22" fill="white">${initials}</text><text x="26" y="299" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="${color}">DEMO PROFILE</text></svg>`;
    const avatar = `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
    const id = `demo-team-${slug}`;

    insert("users", "id,name,email,password_hash,role,status,session_version,onboarded,is_demo,avatar,admin_permissions", [
      id,
      name,
      `${slug}@example.com`,
      hash,
      "MODERATOR",
      "ACTIVE",
      1,
      1,
      1,
      avatar,
      JSON.stringify(perms),
    ]);
    insert("user_preferences", "user_id,country_code,language,theme,preferred_currency,timezone,notifications,auto_alerts", [
      id,
      "CN",
      "en",
      "light",
      "CNY",
      "Asia/Dhaka",
      1,
      0,
    ]);
    insert("team_members", "user_id,department,designation,phone,portfolio,is_ceo,published,display_order", [
      id,
      dept,
      desig,
      `+1 202-555-01${String(index).padStart(2, "0")}`,
      "",
      isCeo,
      1,
      index,
    ]);
  }

  // 10. Student Profile
  insert("student_profiles", "user_id,birth_date,student_status,university,home_country,study_country,home_currency,study_currency,monthly_income,monthly_expenses,goals", [
    "demo-student",
    "2003-04-12",
    "FULL_TIME",
    "Tsinghua University",
    "Bangladesh",
    "China",
    "BDT",
    "CNY",
    "9638.50",
    "27873.50",
    '["tuition","transfers","budget"]',
  ]);

  // 11. Accounts
  insert("accounts", "id,user_id,name,type,currency,balance,archived", [
    "acc-bdt",
    "demo-student",
    "Home savings",
    "SAVINGS",
    "BDT",
    "780000.00",
    0,
  ]);
  insert("accounts", "id,user_id,name,type,currency,balance,archived", [
    "acc-cad",
    "demo-student",
    "RMB student account",
    "BANK",
    "CNY",
    "16880.40",
    0,
  ]);
  insert("accounts", "id,user_id,name,type,currency,balance,archived", [
    "acc-usd",
    "demo-student",
    "Travel wallet",
    "WALLET",
    "USD",
    "420.00",
    0,
  ]);
  insert("accounts", "id,user_id,name,type,currency,balance,archived", [
    "demo-parent-cny",
    "demo-parent",
    "Family RMB wallet",
    "WALLET",
    "CNY",
    "25000.00",
    0,
  ]);

  // 12. Tuition Invoices
  sql.push(
    "INSERT IGNORE INTO tuition_invoices(id,user_id,name,amount,paid,scholarship,currency,due_date,semester) VALUES ('tuition-fall','demo-student','Tsinghua University',41680.00,0.00,5210.00,'CNY',DATE_ADD(CURDATE(),INTERVAL 34 DAY),'Winter 2027');",
  );

  // 13. Transactions (6 months history in CNY)
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
      const amountCad = base * (1 + month * 0.035);
      const amountCny = (amountCad * 5.21).toFixed(2);
      sql.push(
        `INSERT IGNORE INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date,confidence) VALUES ('tx-${month}-${i}','demo-student','acc-cad',${amountCny},'CNY','EXPENSE','${cat}','${description}',DATE_SUB(DATE_SUB(CURDATE(),INTERVAL ${month} MONTH),INTERVAL ${i % 10} DAY),0.96);`,
      );
    }
    const incomeCny = (1850 * 5.21).toFixed(2);
    sql.push(
      `INSERT IGNORE INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date) VALUES ('income-${month}','demo-student','acc-cad',${incomeCny},'CNY','INCOME','Income','Campus assistantship',DATE_SUB(CURDATE(),INTERVAL ${month} MONTH));`,
    );
  }

  // 14. Budgets (in CNY)
  const budgets = [
    ["Housing", 3950],
    ["Food", 320],
    ["Transport", 100],
    ["Education", 150],
    ["Shopping", 120],
    ["Utilities", 80],
    ["Health", 60],
    ["Other", 70],
  ];
  for (const [category, amountCad] of budgets) {
    const amountCny = (amountCad * 5.21).toFixed(2);
    sql.push(
      `INSERT IGNORE INTO budgets(id,user_id,category,amount,currency,month) VALUES ('budget-${category}','demo-student','${category}',${amountCny},'CNY',DATE_FORMAT(CURDATE(),'%Y-%m'));`,
    );
  }

  // 15. Family Link & Parental Controls
  insert("family_links", "id,student_id,parent_id,invite_email,status,invited_by,visibility", [
    "demo-family",
    "demo-student",
    "demo-parent",
    "parent@finbridge.demo",
    "LINKED",
    "STUDENT",
    '{"balances":true,"categories":true,"descriptions":false,"tuition":true,"budgets":true}',
  ]);
  insert(
    "parental_controls",
    "link_id,threshold,per_transfer,daily_limit,monthly_limit,currency,tuition_approval,conversion_approval,auto_approve,allow_non_beneficiary,non_beneficiary_limit",
    ["demo-family", 500, 10000, 15000, 25000, "CAD", 1, 1, 0, 0, 0],
  );

  // 16. Alerts & Notifications
  insert("alerts", "id,user_id,type,severity,detail,status", [
    "alert-TUITION",
    "demo-student",
    "TUITION",
    "WARNING",
    "tuitionApproaching",
    "UNREAD",
  ]);
  insert("alerts", "id,user_id,type,severity,detail,status", [
    "alert-BUDGET",
    "demo-student",
    "BUDGET",
    "WARNING",
    "shoppingBudget",
    "UNREAD",
  ]);
  insert("alerts", "id,user_id,type,severity,detail,status", [
    "alert-FX",
    "demo-student",
    "FX",
    "INFO",
    "favorableRate",
    "UNREAD",
  ]);
  insert("notifications", "id,user_id,type,detail,is_read", [
    "welcome",
    "demo-student",
    "WELCOME",
    "welcomeNotice",
    0,
  ]);

  // 17. Credit Tasks & Profiles
  const creditTasks = ["creditReminders", "creditUtilization", "creditHistory", "creditReport"];
  for (const task of creditTasks) {
    insert("credit_tasks", "id,user_id,task_key,completed", [
      `credit-${task}`,
      "demo-student",
      task,
      task === "creditReminders" ? 1 : 0,
    ]);
  }
  insert("credit_profiles", "user_id,utilization,age_months,overdue,on_time", [
    "demo-student",
    22,
    7,
    0,
    7,
  ]);

  // 18. Agent Runs & Tool Calls
  insert("agent_runs", "id,user_id,goal,status,provider,result", [
    "demo-run",
    "demo-student",
    "Can I afford next semester?",
    "COMPLETED",
    "mock",
    '{"summaryKey":"fundingExplanation","kind":"tuition"}',
  ]);
  for (const tool of ["getStudentProfile", "getAccounts", "calculateTuitionGap"]) {
    insert("agent_tool_calls", "id,run_id,name,input,output,status", [
      `demo-${tool}`,
      "demo-run",
      tool,
      "{}",
      '{"seededExample":true}',
      "SUCCESS",
    ]);
  }

  // 19. Audit Logs & Usage Counters
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

  const header =
    "-- FinBridge AI Complete Unified Seed & Sample Data\n" +
    "-- Development only. Demo password: DemoOnly!2026. CHANGE DEMO CREDENTIALS BEFORE DEPLOYMENT.\n\n";

  await writeFile("database/seed.sql", header + sql.join("\n") + "\n");
  console.log("Successfully generated database/seed.sql");
}

generateSeed().catch((err) => {
  console.error("Error generating seed:", err);
  process.exit(1);
});
