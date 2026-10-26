import {test,expect,type Page,type Locator} from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import {randomUUID,createCipheriv,createHash,randomBytes} from "node:crypto";

const password="PaymentUiFixture!2026";
test.use({channel:"chromium"});
async function database() {
  expect(process.env.DB_NAME).toMatch(/^finbridge_test_/);
  return mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
}
async function fixture(db:mysql.Connection,role:string,demo=0,rotate=0) {
  const id=`payment-ui-${randomUUID()}`;
  await db.execute("INSERT INTO users(id,name,email,password_hash,role,is_demo,onboarded,must_rotate_password) VALUES (?,'Payment Tester',?,?,?,?,1,?)",[id,`${id}@example.test`,await bcrypt.hash(password,4),role,demo,rotate]);
  await db.execute("INSERT INTO user_preferences(user_id,language) VALUES (?,'en')",[id]);
  await db.execute("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id]);
  if(role==="STUDENT") await db.execute("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Test wallet','WALLET','CNY',?)",[`${id}-wallet`,id,demo?100:0]);
  return id;
}
async function login(page:Page,id:string) {
  await page.context().clearCookies();
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(`${id}@example.test`);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).not.toHaveURL(/login/);
}
async function select(page:Page,scope:Page|Locator,name:string,value:string) {
  await scope.getByRole("combobox",{name,exact:true}).click();
  await page.getByRole("option",{name:value,exact:true}).click();
}

test("Add Money opens gateway checkout without automatic credit and notifications remain available",async({page,context})=>{
  test.setTimeout(180000);
  const db=await database(),id=await fixture(db,"STUDENT",1);
  const [old]=await db.execute<mysql.RowDataPacket[]>("SELECT * FROM payment_gateway_config WHERE environment='sandbox'");
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",createHash("sha256").update(process.env.AI_KEY_ENCRYPTION_SECRET!).digest(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({stripeSecret:"sk_test_fixture",stripeWebhookSecret:"whsec_fixture",paypalClientId:"fixture",paypalSecret:"fixture",paypalWebhookId:"fixture"})),cipher.final()]);
  await db.execute("INSERT INTO payment_gateway_config(environment,config_cipher) VALUES ('sandbox',?) ON DUPLICATE KEY UPDATE config_cipher=VALUES(config_cipher)",[[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString("base64")).join(".")]);
  try {
    await context.grantPermissions(["notifications","clipboard-read","clipboard-write"]);
    await login(page,id);await page.goto("/en/payments");
    await expect(page.locator(".sandbox-tag")).toBeVisible();
    await expect(page.getByText("SIMULATED — NO REAL MONEY",{exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Gateway Add Money",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Manual Add Money",exact:true})).toHaveCount(0);
    const actions=page.locator(".payments-panel > .button-group");
    const gap=await actions.evaluate(el=>el.nextElementSibling!.getBoundingClientRect().top-el.getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(16);
    for(const provider of ["Stripe","PayPal"]) {
      await page.getByRole("button",{name:"Add money",exact:true}).first().click();
      const dialog=page.getByRole("dialog");
      await expect(dialog.getByRole("combobox",{name:"Destination wallet"})).toBeVisible();
      await dialog.getByRole("spinbutton",{name:"Amount",exact:true}).fill("10");
      await select(page,dialog,"Payment method",provider);
      await expect(dialog.locator(".dialog-guidance")).toContainText("funds appear only after verification");
      await expect(dialog.getByRole("spinbutton",{name:"Amount",exact:true})).toHaveAttribute("title",/displayed currency/);
      await expect(dialog.locator(".field-instruction")).toHaveCount(0);
      if(provider==="Stripe") {
        await expect(dialog.getByText("4242 4242 4242 4242",{exact:true})).toBeVisible();
        await dialog.getByRole("button",{name:"Copy card number",exact:true}).click();
        expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("4242 4242 4242 4242");
      } else {
        await expect(dialog.getByText("3714 4963 5398 431",{exact:true})).toBeVisible();
        await expect(dialog.locator(".demo-card-details")).toContainText("CVV: 1234");
        await dialog.getByRole("button",{name:"Copy card number",exact:true}).click();
        expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe("3714 4963 5398 431");
      }
      await dialog.getByRole("button",{name:"Review",exact:true}).click();
      await expect(dialog.locator(".checkout-total")).toBeVisible();
      const amount=(await dialog.locator(".checkout-total").innerText()).match(/([\d.]+) USD/)![1];
      const [drafts]=await db.execute<mysql.RowDataPacket[]>("SELECT id FROM financial_requests WHERE user_id=? AND method=? ORDER BY created_at DESC LIMIT 1",[id,provider.toUpperCase()]);
      // A previously created checkout can be reopened without contacting a provider.
      const checkoutId=randomUUID(),url=provider==="Stripe"?`https://checkout.stripe.com/c/pay/${checkoutId}`:`https://www.sandbox.paypal.com/checkoutnow?token=${checkoutId}`;
      await db.execute("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,purpose,request_id,remote_id,approval_url) VALUES (?,?,'student-free','once',?,?,'USD','sandbox','TOPUP',?,?,?)",[checkoutId,id,provider.toUpperCase(),amount,drafts[0].id,checkoutId,url]);
      await db.execute("UPDATE financial_requests SET status='PROCESSING' WHERE id=?",[drafts[0].id]);
      await page.route(url,route=>route.fulfill({contentType:"text/html",body:"<h1>Provider checkout fixture</h1>"}));
      await dialog.getByRole("button",{name:"Open provider checkout",exact:true}).click();
      await expect(page).toHaveURL(url);
      await page.goto(`/en/payments?checkout=${checkoutId}&cancelled=1`);
      await expect(page.getByText(/Checkout was cancelled\. Returning here does not credit/)).toBeVisible();
    }
    const [wallets]=await db.execute<mysql.RowDataPacket[]>("SELECT balance FROM accounts WHERE user_id=?",[id]);
    expect(Number(wallets[0].balance)).toBe(100);
    const [ops]=await db.execute<mysql.RowDataPacket[]>("SELECT status FROM wallet_operations WHERE user_id=?",[id]);
    expect(ops).toHaveLength(0);
    await page.goto("/en/payments");
    await page.getByRole("button",{name:/Notifications:/}).click();
    await page.getByRole("button",{name:"Test notification",exact:true}).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("Test notification sent");
    const notifications=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.ready;
      return (await registration.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag,url:n.data.url}));
    });
    expect(notifications).toEqual(expect.arrayContaining([expect.objectContaining({tag:expect.stringMatching(/^finbridge-test-/),body:"Your FinBridge test notification was delivered successfully.",url:"/en/payments"})]));
    await page.keyboard.press("Escape");
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Add money",exact:true}).first().click();
    await expect(page.getByRole("dialog").getByText("4242 4242 4242 4242",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:".local/payment-form-mobile.png",fullPage:true});
  } finally {
    await db.execute("DELETE FROM payment_gateway_config WHERE environment='sandbox'");
    for(const row of old) await db.execute("INSERT INTO payment_gateway_config(environment,config_cipher) VALUES (?,?)",[row.environment,row.config_cipher]);
    await db.end();
  }
});

test("dashboard guidance covers all roles, forms and languages while excluding the AI agent",async({page})=>{
  test.setTimeout(300000);
  const db=await database();
  try {
    for(const [role,routes] of [
      ["STUDENT",["dashboard","money","wallet","transactions","payments","beneficiaries","transfer","tuition","budget","credit","api-keys","alerts","activity","family","subscription","settings","reports","security-assessment","project-evidence"]],
      ["PARENT",["parent","parent/students","parent/approvals","parent/controls","subscription"]],
      ["ADMIN",["admin","admin/users","admin/plans","admin/subscriptions","admin/reports","admin/risk","admin/agent","admin/finance","admin/audit","admin/settings","admin/catalog","admin/models","admin/team","admin/settlements","admin/payment-methods"]],
    ] as const) {
      const id=await fixture(db,role,1);
      await login(page,id);
      for(const route of routes) {
        await page.goto(`/en/${route}`);
        await expect(page.locator(".dashboard-guidance")).toBeVisible();
        await expect(page.locator(".dashboard-guidance")).not.toContainText("help.page.");
      }
      if(role==="ADMIN") continue;
      await page.goto("/en/subscription");
      await expect(page.getByRole("button",{name:/Simulate subscription/})).toHaveCount(0);
      await page.locator(".plan-choose").filter({hasText:"Choose plan"}).first().click();
      await expect(page.locator(".hosted-checkout")).toContainText("Sandbox checkout");
      await expect(page.getByText("Sandbox checkout: use test payment details. No real money is charged.")).toBeVisible();
      if(role==="STUDENT") {
        await page.goto("/en/money");
        await page.getByRole("button",{name:"Add account",exact:true}).click();
        const dialog=page.getByRole("dialog");
        await expect(dialog.locator(".dialog-guidance")).toBeVisible();
        for(const input of await dialog.locator('input:not([type="hidden"]):not([aria-hidden="true"]), textarea, [role="combobox"]').all()) await expect(input).toHaveAttribute("title",/.+/);
        await page.keyboard.press("Escape");
        const help=page.locator(".dashboard-guidance").getByRole("button",{name:"Show instructions"});
        await help.focus();await expect(page.getByRole("tooltip")).toBeVisible();
        await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).toHaveCount(0);
        for(const locale of ["bn-BD","zh-CN"]) {
          await page.goto(`/${locale}/payments`);
          await expect(page.locator(".dashboard-guidance")).toBeVisible();
          await expect(page.locator(".dashboard-guidance")).not.toContainText("About this page");
          await page.locator(".payments-panel > .button-group button").first().click();
          await expect(page.getByRole("dialog").locator('input[name="amount"]')).toHaveAttribute("title",/.+/);
          await expect(page.getByRole("dialog").locator(".field-instruction")).toHaveCount(0);
          await expect(page.getByRole("dialog")).not.toContainText("help.field.");
          await page.keyboard.press("Escape");
        }
        await page.goto("/en/agent");
        await expect(page.locator(".dashboard-guidance, .field-instruction, .dialog-guidance")).toHaveCount(0);
      }
    }
  } finally {await db.end();}
});

test("payment popup polls every three seconds, stops on success and closes to a clean URL",async({page})=>{
  test.setTimeout(120000);
  const db=await database(),id=await fixture(db,"STUDENT",1);
  try {
    await login(page,id);
    for(const path of ["payments","subscription/checkout"]) {
      const checkout=randomUUID();
      await db.execute("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,status) VALUES (?,?,'student','monthly','STRIPE','3.00','USD','sandbox','CREATED')",[checkout,id]);
      const checks:number[]=[];
      const record=(request:import('@playwright/test').Request)=>{
        if(request.method()==="POST"&&request.headers()["next-action"]&&request.postData()?.includes(checkout))checks.push(Date.now());
      };
      page.on("request",record);
      await page.goto(`/en/${path}?plan=student&checkout=${checkout}&token=provider-return`);
      const dialog=page.getByRole("dialog",{name:"Verifying payment"});
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("progressbar")).toBeVisible();
      await expect(dialog).toContainText("every 3 seconds");
      await expect.poll(()=>checks.length,{timeout:12000}).toBeGreaterThanOrEqual(3);
      const gaps=checks.slice(1).map((time,index)=>time-checks[index]).filter(gap=>gap>1000);
      expect(gaps.length).toBeGreaterThanOrEqual(2);
      for(const gap of gaps) {expect(gap).toBeGreaterThan(2400);expect(gap).toBeLessThan(4300);}
      // Represent a payment already verified by the backend; no provider requests or funds are created by this fixture.
      await db.execute("UPDATE provider_checkouts SET status='COMPLETED',remote_id=?,receipt=?,completed_at=UTC_TIMESTAMP() WHERE id=?",[`cs_${checkout}`,`receipt_${checkout}`,checkout]);
      const success=page.getByRole("dialog",{name:"Payment successful"});
      await expect(success).toBeVisible({timeout:10000});
      await expect(success.getByRole("progressbar")).toHaveCount(0);
      await expect(success).toContainText("Payment verified");
      const after=checks.length;
      await page.waitForTimeout(3500);
      expect(checks).toHaveLength(after);
      await success.getByRole("button",{name:"Close",exact:true}).click();
      await expect(page).toHaveURL(new RegExp(`/en/${path}$`));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      page.off("request",record);
    }
    await page.goto("/en/payments");
    const provider=page.locator(".card").filter({has:page.getByRole("heading",{name:"Provider payment history",exact:true})});
    const other=page.locator(".card").filter({has:page.getByRole("heading",{name:"Deposits and withdrawals",exact:true})});
    expect((await provider.boundingBox())!.y).toBeLessThan((await other.boundingBox())!.y);
    expect(await page.locator(".dashboard-guidance").evaluate(el=>el.previousElementSibling?.classList.contains("payments-panel"))).toBe(true);
    await page.getByRole("button",{name:"Add money",exact:true}).first().click();
    for(const control of await page.getByRole("dialog").locator('input:not([aria-hidden="true"]), [role="combobox"], button').all()) {
      await control.focus();
      await expect(control).toHaveCSS("outline-style","none");
    }
  } finally {await db.end();}
});

test("Live account menu on every landing page, auth redirects and aligned pricing actions",async({page})=>{
  test.setTimeout(180000);
  const db=await database(),id=await fixture(db,"STUDENT");
  try {
    await login(page,id);
    for(const route of ["","features","how-it-works","security","pricing","about","terms","privacy"]) {
      await page.goto(`/en/${route}`);
      const button=page.getByRole("button",{name:"Payment Tester",exact:true});
      await expect(button).toBeVisible();await button.click();
      await expect(page.getByRole("menuitem",{name:"Overview",exact:true})).toHaveAttribute("href","/en/dashboard");
      await page.keyboard.press("Escape");
    }
    for(const route of ["login","register","demo"]) {await page.goto(`/en/${route}`);await expect(page).toHaveURL(/\/en\/dashboard$/);}
    await page.goto("/en/pricing");
    const bottoms=await page.locator(".plan-choose").evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().bottom));
    expect(bottoms).toHaveLength(4);expect(Math.max(...bottoms)-Math.min(...bottoms)).toBeLessThan(2);
    const free=page.locator(".plan-card").filter({has:page.getByRole("heading",{name:"Student Free",exact:true})});
    await expect(free.locator(".plan-features .plan-unavailable")).toHaveCount(2);
    await page.screenshot({path:".local/pricing-aligned.png",fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.goto("/en/features");
    await expect(page.getByRole("button",{name:"Payment Tester",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole("button",{name:"Payment Tester",exact:true}).click();await page.getByRole("menuitem",{name:"Sign out",exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
  } finally {await db.end();}
});

test("admin configuration works without forced security setup and demo admin sees only gateway status",async({page})=>{
  test.setTimeout(180000);
  const db=await database(),admin=await fixture(db,"ADMIN",0,1),demo=await fixture(db,"ADMIN",1);
  const [old]=await db.execute<mysql.RowDataPacket[]>("SELECT * FROM payment_gateway_config");
  try {
    await login(page,admin);await page.goto("/en/admin/payment-methods");
    await expect(page.getByRole("heading",{name:"Payment gateways",exact:true})).toBeVisible();
    await expect(page.getByText(/Complete password rotation/)).toHaveCount(0);
    const gateway=page.locator(".card").filter({has:page.getByRole("heading",{name:"Payment gateways",exact:true})});
    await gateway.getByRole("button",{name:"Live",exact:true}).click();
    await gateway.locator('input[name="stripeSecret"]').fill("sk_live_finbridge_fixture");
    await gateway.locator('input[name="stripePublishableKey"]').fill("pk_live_finbridge_fixture");
    await gateway.locator('input[name="stripeWebhookSecret"]').fill("whsec_finbridge_fixture");
    await gateway.getByRole("button",{name:"Save changes",exact:true}).click();
    await expect(gateway.locator(".configured-gateway").filter({hasText:"Stripe"}).filter({hasText:"Live"})).toBeVisible();
    await page.getByRole("button",{name:"Add account",exact:true}).click();
    const dialog=page.getByRole("dialog");
    await dialog.locator('input[name="holder"]').fill("Live administrator");
    await select(page,dialog,"Payment method","PayPal");
    await dialog.locator('input[name="identifier"]').fill("receiving@example.test");
    await dialog.locator('textarea[name="instructions"]').fill("Pending verification only");
    await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await login(page,demo);await page.goto("/en/admin/payment-methods");
    const readonly=page.locator(".card").filter({has:page.getByRole("heading",{name:"Payment gateways",exact:true})});
    await expect(readonly.locator(".configured-gateway").filter({hasText:"Stripe"}).filter({hasText:"Live"})).toBeVisible();
    await expect(readonly.locator("input")).toHaveCount(0);
    await expect(readonly).not.toContainText("sk_live_finbridge_fixture");
    await page.screenshot({path:".local/demo-admin-gateways.png",fullPage:true});
  } finally {
    await db.execute("DELETE FROM payment_gateway_config");
    for(const row of old) await db.execute("INSERT INTO payment_gateway_config(environment,config_cipher) VALUES (?,?)",[row.environment,row.config_cipher]);
    await db.end();
  }
});
