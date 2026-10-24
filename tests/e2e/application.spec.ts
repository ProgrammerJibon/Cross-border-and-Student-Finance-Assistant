import { test, expect, type Page } from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const connection = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
async function demo(page: Page, role = "Student Premium") {
  await page.goto("/en/demo");
  await page
    .locator(".demo-profile")
    .filter({ has: page.getByRole("heading", { name: role, exact: true }) })
    .click();
  await expect(page.locator(".main-content h1")).toBeVisible();
}
test("student routes, responsive breakpoints, localization and theme", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await expect(page.locator("h1")).toHaveText(
    "Your next chapter, well funded.",
  );
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1024, 1366],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".metric-value").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `.local/screenshots/dashboard-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of [
    "money",
    "transactions",
    "wallet",
    "transfer",
    "tuition",
    "budget",
    "credit",
    "agent",
    "alerts",
    "activity",
    "family",
    "subscription",
    "settings",
    "reports",
    "security-assessment",
  ]) {
    await page.goto(`/en/${route}`);
    await expect(page.locator(".main-content h1").first()).toBeVisible();
    await expect(
      page.getByText("The database is unavailable.", { exact: false }),
    ).toHaveCount(0);
    if (route === "wallet") {
      await page
        .getByLabel("Exchange-rate history", { exact: true })
        .selectOption("USD");
      await expect(page.getByRole("img", { name: /RMB → USD:/ })).toBeVisible();
      await page
        .getByRole("heading", { name: "Exchange-rate history", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: ".local/screenshots/wallet-history.png" });
    }
  }
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByLabel("Language", { exact: true }).selectOption("bn-BD");
  await expect(page).toHaveURL(/bn-BD\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "আগামীর পথ হোক অর্থনিশ্চিত।" }),
  ).toBeVisible();
  await page.getByLabel("ভাষা", { exact: true }).selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "为人生新篇章做好财务准备。" }),
  ).toBeVisible();
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Your next chapter, well funded." }),
  ).toBeVisible();
  if (
    await page.getByRole("button", { name: "Light mode", exact: true }).count()
  )
    await page.getByRole("button", { name: "Light mode", exact: true }).click();
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: ".local/screenshots/dashboard-dark.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light mode", exact: true }).click();
  expect(errors).toEqual([]);
});
test("agent → quote → risk → parent approval → atomic execution → receipt; replay blocked", async ({
  browser,
}) => {
  const db = await connection();
  const suffix = randomUUID().slice(0, 8),
    student = `test-student-${suffix}`,
    parent = `test-parent-${suffix}`,
    account = `test-bdt-${suffix}`,
    link = `test-link-${suffix}`;
  const hash = await bcrypt.hash("TestOnly!2026", 12);
  for (const [id, role] of [
    [student, "STUDENT"],
    [parent, "PARENT"],
  ]) {
    await db.execute(
      "INSERT INTO users(id,name,email,password_hash,role,onboarded) VALUES (?,?,?,?,?,1)",
      [id, `Test ${role}`, `${id}@finbridge.demo`, hash, role],
    );
    await db.execute("INSERT INTO user_preferences(user_id) VALUES (?)", [id]);
    await db.execute(
      "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'pro',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))",
      [randomUUID(), id],
    );
  }
  await db.execute(
    "INSERT INTO student_profiles(user_id,university,monthly_income,monthly_expenses) VALUES (?,'Test University',1000,500)",
    [student],
  );
  await db.execute(
    "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Test source','BANK','BDT',900000)",
    [account, student],
  );
  await db.execute(
    "INSERT INTO tuition_invoices(id,user_id,name,amount,paid,scholarship,currency,due_date,semester) VALUES (?,?,'Test University',8000,0,0,'CAD',DATE_ADD(UTC_DATE(),INTERVAL 40 DAY),'Test semester')",
    [randomUUID(), student],
  );
  await db.execute(
    "INSERT INTO family_links(id,student_id,parent_id,invite_email,status,visibility) VALUES (?,?,?,?,'LINKED',?)",
    [
      link,
      student,
      parent,
      `${parent}@finbridge.demo`,
      JSON.stringify({
        balances: true,
        categories: true,
        descriptions: false,
        tuition: true,
        budgets: false,
      }),
    ],
  );
  await db.execute(
    "INSERT INTO parental_controls(link_id,threshold) VALUES (?,100)",
    [link],
  );
  const sc = await browser.newContext(),
    pc = await browser.newContext();
  const s = await sc.newPage(),
    p = await pc.newPage();
  async function login(page: Page, email: string) {
    await page.goto("/en/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: false }).fill("TestOnly!2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".main-content h1").first()).toBeVisible();
  }
  await login(s, `${student}@finbridge.demo`);
  await s.goto("/en/agent");
  await s.getByRole("button", { name: "Send RMB 800." }).click();
  await expect(
    s
      .locator(".agent-response")
      .getByText("StudentTransfer Demo", { exact: false }),
  ).toBeVisible();
  await expect(
    s.getByText("Providers compared", { exact: true }).first(),
  ).toBeVisible();
  await s
    .locator(".agent-response")
    .getByRole("link", { name: "Review transfer" })
    .click();
  await expect(s.getByLabel("Recipient receives")).toHaveValue("800");
  await s.getByLabel("Purpose").click();
  await s.getByRole("option", { name: "Living expenses", exact: true }).click();
  await s
    .getByRole("button", { name: "Compare providers", exact: true })
    .click();
  await expect(s.locator(".quote-card")).toHaveCount(4);
  await s
    .getByRole("button", { name: "Review transfer", exact: true })
    .first()
    .click();
  await s.getByRole("button", { name: "Run risk checks", exact: true }).click();
  await expect(s.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await s.getByRole("button", { name: "Approve & simulate transfer" }).click();
  await expect(
    s.getByText("Parent approval is required before execution."),
  ).toBeVisible();
  await login(p, `${parent}@finbridge.demo`);
  await expect(p.getByText("Test source", { exact: true })).toHaveCount(0);
  await p.goto("/en/parent/approvals");
  await p.getByRole("button", { name: "Approve", exact: true }).click();
  await p
    .getByLabel("Decision reason")
    .fill("Approved for student living expenses.");
  await p.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  const requests: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  s.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"])
      requests.push({
        url: req.url(),
        headers: req.headers(),
        body: req.postData() || "",
      });
  });
  await s.getByRole("button", { name: "Approve & simulate transfer" }).click();
  await expect(
    s.getByRole("heading", { name: "Transfer simulated successfully" }),
  ).toBeVisible();
  await s.screenshot({ path: ".local/screenshots/transfer-receipt.png" });
  const [transferRows] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT t.id,t.status,q.total FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id WHERE t.user_id=?",
    [student],
  );
  expect(transferRows).toHaveLength(1);
  expect(transferRows[0].status).toBe("COMPLETED");
  const [balance] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT balance FROM accounts WHERE id=?",
    [account],
  );
  expect(Number(balance[0].balance)).toBeCloseTo(
    900000 - Number(transferRows[0].total),
    2,
  );
  const [ledger] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT currency,SUM(IF(direction='DEBIT',amount,-amount)) net FROM sandbox_ledger_entries WHERE transfer_id=? GROUP BY currency",
    [transferRows[0].id],
  );
  expect(ledger.every((r) => Number(r.net) === 0)).toBe(true);
  const execution = requests.find((r) => {
    try {
      const args = JSON.parse(r.body);
      return (
        args.length === 2 &&
        typeof args[1] === "string" &&
        args[1].length === 64
      );
    } catch {
      return false;
    }
  });
  expect(execution).toBeTruthy();
  const replay = await s.request.post(execution!.url, {
    headers: {
      "Next-Action": execution!.headers["next-action"],
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: new URL(execution!.url).origin,
    },
    data: execution!.body,
  });
  expect(await replay.text()).toContain("APPROVAL_REQUIRED");
  const [afterReplay] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT balance FROM accounts WHERE id=?",
    [account],
  );
  expect(afterReplay[0].balance).toBe(balance[0].balance);
  const malicious = await p.request.post(execution!.url, {
    headers: {
      "Next-Action": execution!.headers["next-action"],
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: new URL(execution!.url).origin,
    },
    data: execution!.body,
  });
  expect(await malicious.text()).toContain("FORBIDDEN");
  // Exercise the real parent editor and the child's server-side enforcement.
  await p.goto("/en/parent/controls");
  await p.getByRole("button", { name: "Controls", exact: true }).click();
  await p.getByLabel("Shopping monthly limit (RMB)").fill("0");
  await p.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  await s.goto("/en/transactions");
  await s.getByRole("button", { name: "Add transaction", exact: true }).click();
  await s
    .getByLabel("Description", { exact: false })
    .fill("Blocked category test");
  await s.getByLabel("Amount", { exact: false }).fill("10");
  await s.getByRole("dialog").getByLabel("Category", { exact: false }).click();
  await s.getByRole("option", { name: "Shopping", exact: true }).click();
  await s.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    s.getByText(
      "This expense exceeds a linked parent’s monthly category limit.",
    ),
  ).toBeVisible();
  const [afterCategory] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT balance FROM accounts WHERE id=?",
    [account],
  );
  expect(afterCategory[0].balance).toBe(balance[0].balance);
  await sc.close();
  await pc.close();
  await db.execute(
    "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id IN (?,?)",
    [student, parent],
  );
  await db.end();
});
test("registration, onboarding, account and transaction forms, sandbox checkout", async ({
  page,
}) => {
  const email = `register-${randomUUID().slice(0, 8)}@finbridge.demo`;
  await page.goto("/en/register");
  await page.getByLabel("Name", { exact: false }).fill("New Student");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill("TestOnly!2026");
  await page.getByLabel("Confirm password").fill("TestOnly!2026");
  await page.getByLabel("Profile picture", { exact: true }).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  await page.getByLabel("Name", { exact: false }).fill("New Student");
  await page.getByLabel("University").fill("Test University");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Semester").fill("Winter 2027");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Balance", { exact: false }).fill("1000");
  await page.getByLabel("Income", { exact: false }).fill("500");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.goto("/en/transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: false })
    .fill("Test grocery purchase");
  await page.getByLabel("Amount", { exact: false }).fill("25.50");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Test grocery purchase", { exact: true }),
  ).toBeVisible();
  await page.goto("/en/subscription/checkout?plan=student");
  await page.getByRole("button", { name: "Yearly", exact: true }).click();
  await expect(page.locator(".checkout-total")).toContainText("USD");
  await expect(page.getByRole("radio").first()).toContainText("PayPal");
  await page.goto("/en/subscription");
  await expect(page.locator(".quotas")).toBeVisible();
  const db = await connection();
  await db.execute(
    "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE email=?",
    [email],
  );
  await db.end();
});
test("parent and admin pages have working role-specific workspaces", async ({
  page,
}) => {
  await demo(page, "Parent");
  for (const route of [
    "parent/students",
    "parent/approvals",
    "parent/controls",
  ]) {
    await page.goto(`/en/${route}`);
    await expect(page.locator(".main-content h1")).toBeVisible();
  }
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/parent$/);
  await demo(page, "Administrator");
  for (const route of [
    "admin/users",
    "admin/plans",
    "admin/subscriptions",
    "admin/reports",
    "admin/risk",
    "admin/agent",
    "admin/finance",
    "admin/audit",
    "project-evidence",
  ]) {
    await page.goto(`/en/${route}`);
    await expect(page.locator(".main-content h1")).toBeVisible();
  }
  await page.screenshot({ path: ".local/screenshots/admin-evidence.png" });
});
