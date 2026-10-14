import { test, expect, type Page } from "@playwright/test";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=";
const photo = {
  name: "profile.png",
  mimeType: "image/png",
  buffer: Buffer.from(png, "base64"),
};
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
    "INSERT INTO users(id,name,email,password_hash,role,avatar,onboarded) VALUES (?,?,?,?,?,?,1)",
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

test("device theme, required photo, country default, signup persistence and server preference precedence", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  const email = `theme-${randomUUID().slice(0, 8)}@finbridge.demo`;
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
  await expect(page.locator(".hero-account")).toContainText("RMB");
  await page.goto("/en/register");
  await expect(
    page.getByRole("button", { name: "Light mode", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: false }).fill("Theme Student");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill("TestOnly!2026");
  await page.getByLabel("Confirm password").fill("TestOnly!2026");
  await page.getByLabel("Current country").click();
  await page.getByRole("option", { name: "China", exact: true }).click();
  await expect(
    page.getByLabel("Display currency", { exact: false }),
  ).toContainText("RMB");
  await page
    .getByLabel("Profile picture", { exact: true })
    .setInputFiles(photo);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding$/);
  const db = await dbConnect();
  const [users] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT u.id,u.avatar,p.theme,p.country_code,p.preferred_currency FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.email=?",
    [email],
  );
  expect(users[0]).toMatchObject({
    theme: "dark",
    country_code: "CN",
    preferred_currency: "CNY",
  });
  expect(users[0].avatar).toContain("data:image/png");
  await db.execute("UPDATE users SET onboarded=1 WHERE email=?", [email]);
  await context.close();
  const other = await browser.newContext({ colorScheme: "light" });
  const second = await other.newPage();
  await login(second, email);
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await second.evaluate(() => localStorage.getItem("theme"))).toBe(
    "dark",
  );
  await second.getByRole("button", { name: "Light mode", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(async () => {
      const [r] = await db.execute<mysql.RowDataPacket[]>(
        "SELECT theme FROM user_preferences WHERE user_id=?",
        [users[0].id],
      );
      return r[0].theme;
    })
    .toBe("light");
  await db.execute("UPDATE users SET status='CLOSED' WHERE email=?", [email]);
  await db.end();
  await other.close();
});

test("sidebar survives navigation, collapse persists, global search and add money work", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await login(page, user.email);
    await page.setViewportSize({ width: 1440, height: 700 });
    const nav = page.locator(".sidebar nav");
    await nav.evaluate((el) => (el.scrollTop = 120));
    await page.locator('.sidebar a[href="/en/budget"]').click();
    await expect(page.locator(".main-content h1")).toContainText("Budgets");
    expect(await nav.evaluate((el) => el.scrollTop)).toBeGreaterThan(60);
    await page
      .getByRole("button", { name: "Hide sidebar", exact: true })
      .click();
    await page.reload();
    await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
    await page
      .getByRole("button", { name: "Show sidebar", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Search anything", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("textbox").fill("wallet");
    await page
      .getByRole("dialog")
      .getByRole("link", { name: /Currency wallet/ })
      .click();
    await expect(page).toHaveURL(/wallet$/);
    await page.goto("/en/money");
    await page
      .locator(".account-card")
      .filter({ hasText: "Student wallet" })
      .getByRole("link", { name: "Add money" })
      .click();
    await expect(page).toHaveURL(/payments/);
  } finally {
    await user.close();
  }
});

test("personal Gemini configuration is encrypted, selectable and removable; demo card save and management", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await login(page, user.email);
    await page.goto("/en/settings");
    await page.getByRole("button", { name: "Add AI model" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Label", { exact: false }).fill("My Gemini test");
    await dialog.getByLabel("Company", { exact: false }).click();
    await page.getByRole("option", { name: "Google Gemini" }).click();
    await dialog.getByLabel("Model ID", { exact: false }).fill("gemini-test");
    await dialog
      .getByLabel("API key", { exact: false })
      .fill("test-only-key-never-sent-abcd");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    const [models] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT id,key_cipher,key_last_four FROM ai_models WHERE owner_id=?",
      [user.id],
    );
    expect(models[0].key_cipher).not.toContain("test-only-key");
    expect(models[0].key_last_four).toBe("abcd");
    await page
      .getByLabel("Selected AI model", { exact: true })
      .selectOption(models[0].id);
    await expect
      .poll(async () => {
        const [preferences] = await user.db.execute<mysql.RowDataPacket[]>(
          "SELECT ai_model_id FROM user_preferences WHERE user_id=?",
          [user.id],
        );
        return preferences[0]?.ai_model_id;
      })
      .toBe(models[0].id);
    await page.goto("/en/agent");
    await expect(
      page.getByLabel("Selected AI model", { exact: true }),
    ).toHaveValue(models[0].id);
    await page.goto("/en/settings");
    await page
      .locator("tr")
      .filter({ hasText: "My Gemini test" })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(page.getByText("My Gemini test", { exact: true })).toHaveCount(
      0,
    );
    await page.goto("/en/subscription/checkout?plan=student");
    await page.getByRole("button", { name: "Use demo card" }).click();
    await page.getByLabel("Save this demo card for next time").check();
    await page.getByRole("button", { name: "Simulate payment" }).click();
    await expect(page.getByText("Success", { exact: true })).toBeVisible();
    await page.goto("/en/settings");
    const cards = page.locator(".card").filter({
      has: page.getByRole("heading", {
        name: "Saved demo cards",
        exact: true,
      }),
    });
    await expect(cards).toContainText("4242");
    await cards.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Label", { exact: false })
      .fill("Study card");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(cards).toContainText("Study card");
    await cards.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(cards.getByText("Study card", { exact: true })).toHaveCount(0);
  } finally {
    await user.close();
  }
});

test("parent initiates family invitation, owns controls and can waive parent approval", async ({
  browser,
}) => {
  const student = await fixture();
  const parent = await fixture("PARENT");
  const sc = await browser.newContext();
  const pc = await browser.newContext();
  const s = await sc.newPage();
  const p = await pc.newPage();
  try {
    await login(p, parent.email);
    await p.getByRole("button", { name: "Invite child / student" }).click();
    await p
      .getByRole("dialog")
      .getByLabel("Email address", { exact: false })
      .fill(student.email);
    await p.getByRole("button", { name: "Save changes", exact: true }).click();
    const token = await p.locator(".token-code").innerText();
    await p.getByRole("button", { name: "Close", exact: true }).click();
    await login(s, student.email);
    await s.goto("/en/family");
    await expect(
      s.getByRole("button", { name: "Invite child / student" }),
    ).toHaveCount(0);
    await s.getByRole("button", { name: "Accept invitation" }).click();
    await s
      .getByRole("dialog")
      .getByLabel("Invitation token", { exact: false })
      .fill(token);
    await s.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(s.getByRole("dialog")).toHaveCount(0);
    await expect(
      s.getByRole("button", { name: "Controls", exact: true }),
    ).toHaveCount(0);
    await p.goto("/en/parent/controls");
    await p.getByRole("button", { name: "Controls", exact: true }).click();
    await p
      .getByLabel("Allow payments without parent approval", { exact: false })
      .click();
    await p.getByRole("option", { name: "Enabled", exact: true }).click();
    await p.getByLabel("Approval threshold (RMB)", { exact: false }).fill("0");
    await p.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await s.goto("/en/transfer?amount=800");
    await s.getByLabel("Purpose").click();
    await s
      .getByRole("option", { name: "Living expenses", exact: true })
      .click();
    await s
      .getByRole("button", { name: "Compare providers", exact: true })
      .click();
    await s
      .getByRole("button", { name: "Review transfer", exact: true })
      .first()
      .click();
    await s
      .getByRole("button", { name: "Run risk checks", exact: true })
      .click();
    await expect(s.getByText("Awaiting approval", { exact: true })).toHaveCount(
      0,
    );
    await s
      .getByRole("button", { name: "Approve & simulate transfer" })
      .click();
    await expect(
      s.getByRole("heading", { name: "Transfer simulated successfully" }),
    ).toBeVisible();
    const [r] = await student.db.execute<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) n FROM parent_approvals WHERE parent_id=?",
      [parent.id],
    );
    expect(r[0].n).toBe(0);
  } finally {
    await sc.close();
    await pc.close();
    await student.close();
    await parent.close();
  }
});

test("admin creates a published moderator with narrow access; assessment and evidence are distinct", async ({
  page,
  browser,
}) => {
  await admin(page);
  await page.goto("/en/admin/team");
  await page
    .getByRole("button", { name: "Add team member / moderator" })
    .click();
  const dialog = page.getByRole("dialog");
  const email = `moderator-${randomUUID().slice(0, 8)}@finbridge.demo`;
  await dialog
    .getByLabel("Profile picture", { exact: true })
    .setInputFiles(photo);
  await dialog.getByLabel("Name", { exact: false }).fill("Test Team Member");
  await dialog.getByLabel("Email address", { exact: false }).fill(email);
  await dialog.getByLabel(/^Password/).fill("TestOnly!2026");
  await dialog.getByLabel("Department", { exact: false }).fill("Support");
  await dialog
    .getByLabel("Designation", { exact: false })
    .fill("Support moderator");
  await dialog
    .getByLabel("Portfolio", { exact: false })
    .fill("https://example.com/portfolio");
  await dialog.getByLabel("Published on About Us", { exact: false }).click();
  await page.getByRole("option", { name: "Enabled", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Reports", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const db = await dbConnect();
  const context = await browser.newContext();
  const mod = await context.newPage();
  try {
    await page.goto("/en/about");
    await expect(
      page.getByRole("heading", { name: "Test Team Member" }),
    ).toBeVisible();
    await login(mod, email);
    await expect(
      mod.locator('.sidebar a[href="/en/admin/reports"]'),
    ).toBeVisible();
    await expect(mod.locator('.sidebar a[href="/en/admin/users"]')).toHaveCount(
      0,
    );
    await mod.goto("/en/admin/users");
    await expect(mod).toHaveURL(/\/admin$/);
    await mod.goto("/en/admin/reports");
    await expect(mod.locator(".main-content h1")).toBeVisible();
    await page.goto("/en/project-evidence");
    await expect(
      page.getByRole("heading", { name: "System architecture" }),
    ).toBeVisible();
    await expect(
      page.getByText("Next.js App Router", { exact: true }),
    ).toHaveCount(0);
    await page.goto("/en/security-assessment");
    await expect(
      page.getByRole("heading", { name: "System architecture" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Security boundaries" }),
    ).toBeVisible();
  } finally {
    await db.execute(
      "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE email=?",
      [email],
    );
    await db.end();
    await context.close();
  }
});

test("admin adds a currency then a country with that default", async ({
  page,
}) => {
  await admin(page);
  const db = await dbConnect();
  const code = "XTS";
  const [existing] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT code FROM currencies WHERE code='XTS' UNION ALL SELECT code FROM countries WHERE code='ZZ'",
  );
  if (existing.length) {
    await db.end();
    test.skip(true, "Catalog fixture codes already exist");
    return;
  }
  try {
    await page.goto("/en/admin/catalog");
    const currencies = page.locator(".card").filter({
      has: page.getByRole("heading", {
        name: "Your currencies",
        exact: true,
      }),
    });
    await currencies
      .getByRole("button", { name: "Add new", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("code", { exact: false }).fill(code);
    await dialog.getByLabel("Name", { exact: false }).fill("Test currency");
    await dialog.getByLabel("symbol", { exact: false }).fill("T");
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const countries = page.locator(".card").filter({
      has: page.getByRole("heading", { name: "Countries", exact: true }),
    });
    await countries
      .getByRole("button", { name: "Add new", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Country code", { exact: false }).fill("ZZ");
    await dialog.getByLabel("Name", { exact: false }).fill("Test country");
    await dialog.getByLabel("Default currency", { exact: false }).click();
    await page.getByRole("option", { name: code, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const [r] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT currency_code FROM countries WHERE code='ZZ'",
    );
    expect(r[0].currency_code).toBe(code);
  } finally {
    await db.execute(
      "DELETE FROM countries WHERE code='ZZ' AND name='Test country'",
    );
    await db.execute("DELETE FROM fx_rates WHERE currency=?", [code]);
    await db.execute(
      "DELETE FROM currencies WHERE code=? AND name='Test currency'",
      [code],
    );
    await db.end();
  }
});
