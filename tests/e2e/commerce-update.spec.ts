import {test,expect} from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";
process.loadEnvFile(".env.local");
test("pricing, flags, form focus, demo tiers and notification test",async({page})=>{
  await page.goto("/en/pricing");
  await expect(page.locator(".plan-card")).toHaveCount(4);
  for(const name of ["Student Free","Student Pro","Family Lite","Family Pro"]) await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  await expect(page.locator(".plan-card").filter({has:page.getByRole("heading",{name:"Student Pro",exact:true})})).toContainText("299");
  await expect(page.locator(".plan-card").filter({has:page.getByRole("heading",{name:"Family Pro",exact:true})})).toContainText("1,499");
  await expect(page.locator(".language-select .MuiSelect-select svg")).toBeVisible();
  await expect(page.locator(".language-select fieldset")).toHaveCSS("border-top-width","0px");
  await page.goto("/en/login");
  const email=page.getByRole("textbox",{name:"Email address",exact:true});await email.focus();
  await expect(email).toHaveCSS("outline-style","none");
  await page.goto("/en/demo");
  for(const name of ["Student Free","Student Pro","Family Lite","Family Pro"]) await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  await page.locator(".demo-profile").filter({has:page.getByRole("heading",{name:"Student Free",exact:true})}).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator('.sidebar a[href="/en/tuition"]')).toHaveCount(0);
  await page.getByRole("button",{name:/Notifications:/}).click();
  await expect(page.getByRole("button",{name:"Test notification",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/en/agent");
  await expect(page.locator(".agent-workspace-title")).toHaveCount(0);
  await page.goto("/en/demo");
  await page.locator(".demo-profile").filter({has:page.getByRole("heading",{name:"Student Pro",exact:true})}).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator('.sidebar a[href="/en/tuition"]')).toBeVisible();
});
test("real account has full Stripe option, sandbox details, live switch and hosted top-up",async({page})=>{
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const id=`ui-commerce-${randomUUID()}`,email=`${id}@example.test`,password="CommerceTest!2026";
  try{
    await db.execute("INSERT INTO users(id,name,email,password_hash,role,onboarded) VALUES (?,'Checkout tester',?,?,'STUDENT',1)",[id,email,await bcrypt.hash(password,4)]);
    await db.execute("INSERT INTO user_preferences(user_id) VALUES (?)",[id]);
    await db.execute("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student-free',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id]);
    await db.execute("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Test wallet','BANK','CNY',0)",[randomUUID(),id]);
    await page.goto("/en/login");await page.getByRole("textbox",{name:"Email address",exact:true}).fill(email);await page.getByRole("textbox",{name:"Password",exact:true}).fill(password);await page.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/en/subscription/checkout?plan=student");
    await expect(page.getByRole("radio").first()).toContainText("UnionPay");
    await page.getByRole("radio",{name:/Stripe All eligible/}).click();
    await expect(page.getByText("All eligible payment methods enabled in Stripe")).toBeVisible();
    await expect(page.getByText("4242 4242 4242 4242")).toBeVisible();
    await page.getByRole("button",{name:"Live",exact:true}).click();
    await expect(page.getByText("Sandbox test details",{exact:true})).toHaveCount(0);
    await page.goto("/en/payments");await page.getByRole("button",{name:"Add money",exact:true}).click();
    await page.getByRole("combobox",{name:/Payment method/}).click();
    await expect(page.getByRole("option",{name:"Stripe",exact:true})).toHaveCount(1);
    await expect(page.getByRole("option",{name:/Alipay/})).toHaveCount(1);
    await expect(page.getByRole("option",{name:/WeChat/})).toHaveCount(1);
  }finally{
    for(const table of ["notifications","generated_alerts","alerts","accounts","subscriptions","user_preferences"]) await db.execute(`DELETE FROM ${table} WHERE user_id=?`,[id]);
    await db.execute("DELETE FROM audit_logs WHERE actor_id=?",[id]);await db.execute("DELETE FROM auth_attempts WHERE identifier=?",[email]);await db.execute("DELETE FROM users WHERE id=?",[id]);await db.end();
  }
});
