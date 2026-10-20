import { readFile } from "node:fs/promises";
import { seedDemoTeam } from "./demo-team.mjs";
export async function migratePlatform(db) {
  try {
    const content = await readFile(new URL("../database/platform.sql", import.meta.url), "utf8");
    for (const sql of content.split(";").filter((s) => s.trim())) await db.query(sql);
  } catch {}
  const additions = [
    ["users", "avatar", "MEDIUMTEXT NULL"],
    ["users", "admin_permissions", "JSON NULL"],
    ["user_preferences", "country_code", "CHAR(2) NOT NULL DEFAULT 'BD'"],
    ["user_preferences", "ai_model_id", "VARCHAR(64) NULL"],
    ["parental_controls", "auto_approve", "BOOLEAN NOT NULL DEFAULT 0"],
    ["family_links", "invited_by", "VARCHAR(10) NOT NULL DEFAULT 'STUDENT'"],
  ];
  for (const [table, column, definition] of additions) {
    const [r] = await db.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
      [table, column],
    );
    if (!r.length)
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  const [role] = await db.execute(
    "SELECT COLUMN_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role'",
  );
  if (!role[0].t.includes("MODERATOR"))
    await db.query(
      "ALTER TABLE users MODIFY role ENUM('STUDENT','PARENT','ADMIN','MODERATOR') NOT NULL DEFAULT 'STUDENT'",
    );
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
  for (const [code, [rate, countries]] of Object.entries(groups)) {
    await db.execute(
      "INSERT IGNORE INTO currencies(code,name,symbol,active) VALUES (?,?,?,1)",
      [
        code,
        code === "CNY" ? "Chinese yuan (RMB)" : currencyNames.of(code),
        code === "CNY" ? "¥" : code === "BDT" ? "৳" : code,
      ],
    );
    await db.execute(
      "INSERT IGNORE INTO fx_rates(id,currency,rate) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM fx_rates WHERE currency=?)",
      [`catalog-${code}`, code, rate, code],
    );
    for (const country of countries.split(" "))
      await db.execute(
        "INSERT IGNORE INTO countries(code,name,currency_code) VALUES (?,?,?)",
        [country, names.of(country), code],
      );
  }
  // Change initial defaults only once; never overwrite later user preferences.
  const [done] = await db.execute(
    "SELECT id FROM platform_migrations WHERE id='rmb-focus'",
  );
  if (!done.length) {
    await db.query(
      "ALTER TABLE user_preferences ALTER preferred_currency SET DEFAULT 'CNY'",
    );
    await db.query(
      "UPDATE user_preferences SET preferred_currency='CNY' WHERE user_id IN ('demo-student','demo-parent','demo-admin')",
    );
    await db.execute(
      "INSERT INTO platform_migrations(id) VALUES ('rmb-focus')",
    );
  }
  const [demoFocus] = await db.execute(
    "SELECT id FROM platform_migrations WHERE id='rmb-demo-balances'",
  );
  if (!demoFocus.length) {
    await db.beginTransaction();
    try {
      for (const [table, fields] of [
        ["accounts", ["balance"]],
        ["transactions", ["amount"]],
        ["budgets", ["amount"]],
        ["tuition_invoices", ["amount", "paid", "scholarship"]],
      ])
        await db.query(
          `UPDATE ${table} SET ${fields.map((f) => `${f}=${f}*5.21`).join(",")},currency='CNY' WHERE user_id='demo-student' AND currency='CAD'`,
        );
      await db.query(
        "UPDATE student_profiles SET study_currency='CNY',study_country='China',university='Tsinghua University',monthly_income=monthly_income*5.21,monthly_expenses=monthly_expenses*5.21 WHERE user_id='demo-student' AND study_currency='CAD'",
      );
      await db.query(
        "UPDATE tuition_invoices SET name='Tsinghua University' WHERE user_id='demo-student' AND name='University of Toronto'",
      );
      await db.query(
        "UPDATE accounts SET name='RMB student account' WHERE id='acc-cad'",
      );
      await db.execute(
        "INSERT INTO platform_migrations(id) VALUES ('rmb-demo-balances')",
      );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
  }
  await seedDemoTeam(db);
}
