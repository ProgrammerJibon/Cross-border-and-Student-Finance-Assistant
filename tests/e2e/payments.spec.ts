import { test, expect, type Page } from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=";
const dbConnect = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
async function fixture(role = "STUDENT") {
  const db = await dbConnect();
  const id = `platform-${randomUUID().slice(0, 8)}`;
  const email = `${id}@finbridge.demo`;
  await db.execute(
    "INSERT INTO users(is_demo,id,name,email,password_hash,role,avatar,onboarded) VALUES (1,?,?,?,?,?,?,1)",
    [
      id,
      `Test ${role}`,
      email,
      await bcrypt.hash("TestOnly!2026", 12),
      role,
      `data:image/png;base64,${png}`,
    ],
  );
  await db.execute(
    "INSERT INTO user_preferences(user_id,preferred_currency,country_code) VALUES (?,'CNY','CN')",
    [id],
  );
  await db.execute(
    "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'family',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))",
    [randomUUID(), id],
  );
  if (role === "STUDENT") {
    await db.execute(
      "INSERT INTO student_profiles(user_id,study_currency,study_country) VALUES (?,'CNY','China')",
      [id],
    );
    await db.execute(
      "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Student wallet','BANK','CNY',1000),(?,?,'Home funds','BANK','BDT',900000)",
      [`${id}-cny`, id, `${id}-bdt`, id],
    );
  }
  return {
    id,
    email,
    db,
    close: async () => {
      await db.execute(
        "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id=?",
        [id],
      );
      await db.end();
    },
  };
}
async function login(page: Page, email: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill("TestOnly!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".main-content h1").first()).toBeVisible();
}
async function admin(page: Page) {
  await page.goto("/en/demo");
  await page
    .locator(".demo-profile")
    .filter({
      has: page.getByRole("heading", { name: "Administrator", exact: true }),
    })
    .click();
  await expect(page.locator(".main-content h1")).toBeVisible();
}

test("AI card top-up and manual bank deposit complete through the shared settlement UI", async ({
  page,
  browser,
}) => {
  const user = await fixture();
  const ac = await browser.newContext();
  const a = await ac.newPage();
  try {
    await login(page, user.email);
    await page.goto("/en/agent");
    await page
      .getByRole("button", { name: "Add money RMB 100 by card.", exact: false })
      .click();
    await expect(
      page.getByText("Your payment draft is saved.", { exact: false }),
    ).toBeVisible();
    await page
      .locator(".agent-response")
      .getByRole("button", { name: "Review and confirm", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Use demo card" })
      .click();
    await page
      .getByRole("button", { name: "Confirm payment request", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => {
        const [r] = await user.db.execute<mysql.RowDataPacket[]>(
          "SELECT balance FROM accounts WHERE id=?",
          [`${user.id}-cny`],
        );
        return r[0].balance;
      })
      .toBe("1100.00");
    await page.goto("/en/payments");
    await page.getByRole("button", { name: "Add money", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Payment method", { exact: false }).click();
    await page
      .getByRole("option", { name: "Bank / wire transfer", exact: true })
      .click();
    await dialog.getByLabel("Source account", { exact: false }).click();
    await page.getByRole("option", { name: /Student wallet/ }).click();
    await dialog.getByLabel("Amount", { exact: false }).fill("40");
    await dialog
      .getByRole("button", { name: "Review and confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("DEMO ONLY");
    await page
      .getByRole("dialog")
      .getByLabel("Your deposit reference", { exact: false })
      .fill("TEST-BANK-DEPOSIT");
    await page
      .getByRole("button", { name: "Confirm payment request", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const [requests] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT id,status FROM financial_requests WHERE user_id=? AND method='BANK'",
      [user.id],
    );
    const request = requests[0];
    expect(request.status).toBe("QUEUED");
    const [balances] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT balance FROM accounts WHERE id=?",
      [`${user.id}-cny`],
    );
    expect(balances[0].balance).toBe("1100.00");
    await admin(a);
    await a.goto("/en/admin/settlements");
    const row = a.locator("tr").filter({ hasText: request.id.slice(0, 8) });
    await row.getByRole("button", { name: "Process request" }).click();
    await a
      .getByRole("dialog")
      .getByLabel("Status update", { exact: false })
      .fill("Checking bank deposit");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("button", { name: "Process request" }).click();
    await a
      .getByRole("dialog")
      .getByLabel("Settlement reference / receipt", { exact: false })
      .fill("DEMO-BANK-VERIFIED");
    await a
      .getByRole("dialog")
      .getByLabel("Status update", { exact: false })
      .fill("Demo deposit verified");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(
      page.locator("tr").filter({ hasText: request.id.slice(0, 8) }),
    ).toContainText("Completed");
    await page.goto("/en/transactions");
    await page
      .getByRole("tab", { name: "Payment requests", exact: true })
      .click();
    await expect(
      page.locator("tr").filter({ hasText: request.id.slice(0, 8) }),
    ).toContainText("Completed");
    await page.screenshot({
      path: ".local/screenshots/payment-history.png",
      fullPage: true,
    });
    const [end] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT balance FROM accounts WHERE id=?",
      [`${user.id}-cny`],
    );
    expect(end[0].balance).toBe("1140.00");
  } finally {
    await ac.close();
    await user.close();
  }
});

test("student beneficiary approval is visible to the linked parent", async ({
  page,
  browser,
}) => {
  const student = await fixture();
  const parent = await fixture("PARENT");
  const pc = await browser.newContext();
  const p = await pc.newPage();
  const link = randomUUID();
  try {
    await student.db.execute(
      "INSERT INTO family_links(id,student_id,parent_id,invite_email,status,visibility,invited_by) VALUES (?,?,?,?,'LINKED','{}','PARENT')",
      [link, student.id, parent.id, student.email],
    );
    await student.db.execute(
      "INSERT INTO parental_controls(link_id) VALUES (?)",
      [link],
    );
    await login(page, student.email);
    await page.goto("/en/beneficiaries");
    await page
      .getByRole("button", { name: "Add beneficiary", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: false }).fill("My parent");
    await dialog
      .getByLabel("Recipient bank / payment details", { exact: false })
      .fill(parent.email);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator("tr").filter({ hasText: "My parent" }),
    ).toContainText("Pending");
    await login(p, parent.email);
    await p.goto("/en/beneficiaries");
    await p
      .locator("tr")
      .filter({ hasText: "My parent" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByLabel("Reason", { exact: false })
      .fill("Known family wallet");
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator("tr").filter({ hasText: "My parent" }),
    ).toContainText("Approved");
  } finally {
    await pc.close();
    await student.close();
    await parent.close();
  }
});

test("structured agent opens pages and saves a reviewed rent budget once", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await login(page, user.email);
    await page.goto("/en/agent");
    await page.locator(".agent-composer textarea").fill("Open tuition planner");
    await page.locator(".agent-composer button").click();
    await expect(page).toHaveURL(/\/tuition$/);
    await page.goto("/en/agent");
    await page
      .locator(".agent-composer textarea")
      .fill("Plan rent RMB 2200 for 2026-11");
    await page.locator(".agent-composer button").click();
    const review = page.locator(".agent-action-review");
    await expect(review).toContainText("2200");
    let [budgets] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM budgets WHERE user_id=? AND month='2026-11'",
      [user.id],
    );
    expect(budgets).toHaveLength(0);
    await review
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "completed successfully",
    );
    [budgets] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT amount,category FROM budgets WHERE user_id=? AND month='2026-11'",
      [user.id],
    );
    expect(budgets).toHaveLength(1);
    expect(budgets[0].amount).toBe("2200.00");
    expect(budgets[0].category).toBe("Housing");
    await page.reload();
    await page
      .getByLabel("Previous conversations", { exact: true })
      .selectOption({ label: "Plan rent RMB 2200 for 2026-11" });
    await expect(
      page.locator(".agent-action-review").getByRole("status"),
    ).toContainText("completed successfully");
    await expect(
      page.getByRole("button", { name: "Confirm action", exact: true }),
    ).toHaveCount(0);
  } finally {
    await user.close();
  }
});

test("public pages use distinct sections without repeated journey blocks", async ({
  page,
}) => {
  const cases = [
    { path: "/en", home: 1, journey: 0, features: 0, security: 0 },
    { path: "/en/features", home: 0, journey: 0, features: 1, security: 0 },
    { path: "/en/how-it-works", home: 0, journey: 1, features: 0, security: 0 },
    { path: "/en/security", home: 0, journey: 0, features: 0, security: 1 },
  ];
  for (const c of cases) {
    await page.goto(c.path);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(
      page.locator('[data-public-section="home-planning"]'),
    ).toHaveCount(c.home);
    await expect(page.locator(".journey-visual")).toHaveCount(c.journey);
    await expect(page.locator(".public-features")).toHaveCount(c.features);
    await expect(
      page.locator('[data-public-section="security-data"]'),
    ).toHaveCount(c.security);
    await expect(page.locator(".how-steps")).toHaveCount(0);
  }
});
