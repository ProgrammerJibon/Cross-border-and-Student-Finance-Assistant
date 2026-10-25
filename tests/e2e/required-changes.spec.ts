import {test,expect,type Page,type Locator} from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";
import {totp} from "../../src/lib/totp";
const password="RequiredChanges!2026";
async function database() {
  expect(process.env.DB_NAME).toMatch(/^finbridge_test_/);
  return mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
}
async function fixture(db:mysql.Connection,role="STUDENT",onboarded=1,demo=0) {
  const id=`browser-${randomUUID()}`;
  await db.execute("INSERT INTO users(id,name,email,password_hash,role,is_demo,onboarded) VALUES (?,?,?,?,?,?,?)",[id,"Required Changes",`${id}@example.test`,await bcrypt.hash(password,4),role,demo,onboarded]);
  await db.execute("INSERT INTO user_preferences(user_id,language) VALUES (?,'en')",[id]);
  await db.execute("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,?,UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id,role==="PARENT"?"family":"student"]);
  if(role==="STUDENT")await db.execute("INSERT INTO student_profiles(user_id) VALUES (?)",[id]);
  return id;
}
async function login(page:Page,id:string) {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(`${id}@example.test`);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function select(page:Page,scope:Page|Locator,name:string,value:string) {
  await scope.getByRole("combobox",{name,exact:true}).click();
  await page.getByRole("option",{name:value,exact:true}).click();
}
test("Live onboarding, editable profile and tuition, budget isolation, mobile forms",async({page})=>{
  test.setTimeout(240000);
  const db=await database(),id=await fixture(db,"STUDENT",0);
  try {
    await login(page,id);await expect(page).toHaveURL(/onboarding/);
    await select(page,page,"Student status","Part-time student");
    await select(page,page,"Home country","Bangladesh");
    await select(page,page,"Study country","China");
    await page.locator('input[name="university"]').fill("Test University");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.locator('input[name="tuition"]').fill("1000");
    await page.locator('input[name="programme"]').fill("Computer Science");
    await page.locator('input[name="semester"]').fill("Fall 2027");
    await page.locator('input[name="funding_needs"]').fill("800");
    await page.locator('input[name="due_date"]').fill("2027-09-01");
    await page.locator('input[name="first_due_date"]').fill("2027-09-01");
    await expect(page.locator('input[name="paid"]')).toHaveCount(0);
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await expect(page.locator('input[name="balance"]')).toHaveCount(0);
    await page.locator('input[name="income"]').fill("100");
    await page.locator('input[name="expenses"]').fill("50");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByRole("button",{name:"Finish setup",exact:true}).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator(".sandbox-tag")).toHaveCount(0);
    await expect(page.getByText(/LIVE account/)).toHaveCount(0);
    const [profile]=await db.execute<mysql.RowDataPacket[]>("SELECT * FROM student_profiles WHERE user_id=?",[id]);
    expect(profile[0].student_status).toBe("PART_TIME");
    expect(profile[0].study_country).toBe("China");
    await page.goto("/en/tuition");await expect(page.getByText("Computer Science",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Edit",exact:true}).first().click();
    let dialog=page.getByRole("dialog");
    await dialog.locator('input[name="programme"]').fill("Data Science");
    await dialog.locator('input[name="scholarship"]').fill("2000");
    await dialog.getByRole("button",{name:"Save changes",exact:true}).click();
    await expect(dialog.getByText("Paid amount plus scholarship cannot exceed tuition.",{exact:true})).toBeVisible();
    await expect(dialog.locator('input[name="scholarship"]')).toHaveAttribute("aria-invalid","true");
    await dialog.locator('input[name="scholarship"]').fill("100");
    await select(page,dialog,"Payment schedule","Monthly installments");
    await dialog.locator('input[name="first_due_date"]').fill("2027-07-01");
    await dialog.locator('input[name="installments"]').fill("3");
    await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);
    await page.reload();await expect(page.getByText("Data Science",{exact:true})).toBeVisible();
    await expect(page.getByText(/Next tuition payment: 2027-07-01/)).toContainText("300.00");
    await page.goto("/en/settings");await select(page,page,"Student status","Full-time student");
    await select(page,page,"Study country","Canada");
    await page.locator('form').filter({has:page.locator('input[name="name"]')}).getByRole("button",{name:"Save changes",exact:true}).click();
    await page.reload();await expect(page.getByRole("combobox",{name:"Study country",exact:true})).toContainText("Canada");
    await page.goto("/en/transactions");
    for(const type of ["Expense","Income"]) {
      await page.getByRole("button",{name:"Add transaction",exact:true}).click();dialog=page.getByRole("dialog");
      await dialog.locator('input[name="description"]').fill(`Recorded ${type}`);
      await dialog.locator('input[name="amount"]').fill("250");
      await select(page,dialog,"Type",type);
      await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);
      await expect(page.getByText(`Recorded ${type}`,{exact:true})).toBeVisible();
    }
    const [wallet]=await db.execute<mysql.RowDataPacket[]>("SELECT balance,recorded_balance FROM accounts WHERE user_id=?",[id]);
    expect(Number(wallet[0].balance)).toBe(0);expect(Number(wallet[0].recorded_balance)).toBe(0);
    const [ledger]=await db.execute<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM transactions WHERE user_id=?",[id]);expect(ledger[0].n).toBe(0);
    await page.getByRole("button",{name:"Import CSV",exact:true}).click();dialog=page.getByRole("dialog");
    const upload=async(amount:string)=>dialog.locator('input[type="file"]').setInputFiles({name:"budget.csv",mimeType:"text/csv",buffer:Buffer.from(`description,amount,type,category,date,notes\nCSV record,${amount},EXPENSE,Food,2026-10-25,Recorded only`)});
    await upload("invalid");await dialog.getByRole("button",{name:"Import CSV",exact:true}).and(dialog.locator("button")).click();
    await expect(dialog.getByRole("alert")).toContainText("Amount");
    await upload("25.00");await dialog.getByRole("button",{name:"Import CSV",exact:true}).and(dialog.locator("button")).click();
    await expect(dialog.getByRole("status")).toContainText("1");
    const [afterCsv]=await db.execute<mysql.RowDataPacket[]>("SELECT balance FROM accounts WHERE user_id=?",[id]);expect(Number(afterCsv[0].balance)).toBe(0);
    await page.keyboard.press("Escape");
    for(const route of ["dashboard","money","transactions","budget","tuition","settings","payments","family","alerts","reports"]) {
      await page.setViewportSize({width:390,height:844});await page.goto(`/en/${route}`);
      await expect(page.locator(".main-content")).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route).toBe(true);
    }
    await page.goto("/en/payments?checkout=00000000-0000-4000-8000-000000000000&cancelled=1");
    await expect(page.getByText(/Checkout was cancelled/)).toBeVisible();
    await expect(page.getByRole("button",{name:"Gateway Add Money",exact:true})).toBeDisabled();
  } finally {await db.end();}
});

test("MFA is optional and enrollment works for every role; normal login still enforces enabled MFA",async({page})=>{
  test.setTimeout(240000);const db=await database();
  try {
    for(const role of ["STUDENT","PARENT","ADMIN","MODERATOR"]) {
      const id=await fixture(db,role);
      await login(page,id);await expect(page).not.toHaveURL(/login/);
      await page.goto("/en/settings");
      await page.getByRole("button",{name:"Set up authenticator",exact:true}).click();
      const code=page.locator(".card code");await expect(code).toBeVisible();
      const secret=(await code.textContent())!;
      await page.locator('input[name="code"]').fill(totp(secret,Math.floor(Date.now()/30000)));
      await page.getByRole("button",{name:"Confirm",exact:true}).click();await expect(page).toHaveURL(/login/);
      await login(page,id);await expect(page.getByText(/authenticator code/i).last()).toBeVisible();await expect(page).toHaveURL(/login/);
      await page.locator('input[name="mfa"]').fill(totp(secret,Math.floor(Date.now()/30000)+1));
      await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).not.toHaveURL(/login/);
      await page.goto("/en/settings");await expect(page.getByText("Authenticator protection is enabled.")).toBeVisible();
    }
  } finally {await db.end();}
});

test("language labels, focus background and gateway configuration validation",async({page})=>{
  test.setTimeout(180000);const db=await database(),admin=await fixture(db,"ADMIN");
  try {
    await page.goto("/en/login");const language=page.getByRole("combobox",{name:"Language",exact:true});
    await expect(language).toContainText("English");
    const before=await language.evaluate(el=>getComputedStyle(el).backgroundColor);await language.focus();
    expect(await language.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(before);
    await language.click();await expect(page.getByRole("option",{name:"简体中文",exact:true})).toBeVisible();await expect(page.getByRole("option",{name:"বাংলা",exact:true})).toBeVisible();await page.keyboard.press("Escape");
    await login(page,admin);await expect(page).toHaveURL(/admin/);
    await page.goto("/en/admin/payment-methods");
    await page.locator('input[name="stripePublishableKey"]').fill("pk_live_wrong_environment");
    await page.locator('form').filter({has:page.locator('input[name="stripeSecret"]')}).getByRole("button",{name:"Save changes",exact:true}).click();
    await expect(page.getByText(/Use a valid sandbox stripePublishableKey/).first()).toBeVisible();
    await page.getByRole("button",{name:"Test provider configuration",exact:true}).click();
    await expect(page.getByText(/Missing credentials or webhook configuration/).first()).toBeVisible();
    await page.getByRole("button",{name:"Live",exact:true}).click();
    await page.getByRole("button",{name:"Test provider configuration",exact:true}).click();
    await expect(page.getByText(/no approved wallet-funding settlement partner/)).toBeVisible();
    await page.getByRole("button",{name:"Sandbox",exact:true}).click();
    await page.locator('input[name="stripePublishableKey"]').fill("pk_test_fixture_settings");
    await page.locator('input[name="stripeSecret"]').fill("sk_test_fixture_settings");
    await page.locator('input[name="stripeWebhookSecret"]').fill("whsec_fixture_settings");
    await page.locator('input[name="paypalClientId"]').fill("fixture_paypal_client");
    await page.locator('input[name="paypalSecret"]').fill("fixture_paypal_secret");
    await page.locator('input[name="paypalWebhookId"]').fill("fixture_webhook_id");
    await page.locator('form').filter({has:page.locator('input[name="stripeSecret"]')}).getByRole("button",{name:"Save changes",exact:true}).click();
    await expect(page.locator('input[name="stripeSecret"]')).toHaveValue("");
    const [stored]=await db.execute<mysql.RowDataPacket[]>("SELECT config_cipher FROM payment_gateway_config WHERE environment='sandbox'");
    expect(stored).toHaveLength(1);expect(stored[0].config_cipher).not.toContain("fixture");expect(stored[0].config_cipher.split(".")).toHaveLength(3);
    const [audit]=await db.execute<mysql.RowDataPacket[]>("SELECT * FROM audit_logs WHERE actor_id=? AND action='GATEWAY_CONFIG_UPDATED'",[admin]);
    expect(audit.length).toBeGreaterThan(0);expect(JSON.stringify(audit)).not.toContain("fixture_settings");
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {await db.execute("DELETE FROM payment_gateway_config WHERE environment='sandbox'");await db.end();}
});

test("responsive page and form audit across public, student, parent and admin routes",async({page})=>{
  test.setTimeout(300000);const db=await database();
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.setViewportSize({width:390,height:844});
    const sweep=async(routes:string[])=>{
      for(const route of routes) {
        const response=await page.goto(`/en/${route}`);expect(response?.ok(),route).toBe(true);
        await expect(page.locator("body")).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route).toBe(true);
        for(const button of await page.locator('form button[type="submit"]').all()) {
          if(await button.isVisible()) {const box=await button.boundingBox();expect(box!.height,route).toBeGreaterThanOrEqual(30);}
        }
      }
    };
    await sweep(["","features","how-it-works","security","pricing","about","terms","privacy","login","register","forgot-password","demo"]);
    for(const [role,routes] of [
      ["STUDENT",["dashboard","money","transactions","wallet","transfer","tuition","budget","credit","agent","api-keys","alerts","activity","family","subscription","settings","reports","security-assessment","payments","beneficiaries"]],
      ["PARENT",["parent","parent/students","parent/approvals","parent/controls","settings","payments"]],
      ["ADMIN",["admin","admin/users","admin/plans","admin/subscriptions","admin/reports","admin/risk","admin/agent","admin/finance","admin/audit","admin/settings","admin/catalog","admin/models","admin/team","admin/payment-methods","admin/settlements","project-evidence","settings"]],
    ] as [string,string[]][]) {
      const id=await fixture(db,role);await login(page,id);await expect(page).not.toHaveURL(/login/);await sweep(routes);
    }
    expect(errors).toEqual([]);
  } finally {await db.end();}
});
