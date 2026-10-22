import { test, expect, type Page } from "@playwright/test";
import mysql from "mysql2/promise";
import {
  randomUUID,
  createHash,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import { SignJWT } from "jose";
process.loadEnvFile(".env.local");
test.skip(
  process.env.AGENT_E2E_FIXTURES !== "1",
  "Run with playwright.agent.config.ts and its isolated provider fixture server.",
);
const connect = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
function encrypt(value: string) {
  const key = createHash("sha256")
    .update(process.env.AI_KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET!)
    .digest();
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const result = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), result]
    .map((v) => v.toString("base64"))
    .join(".");
}
async function fixture(page: Page, role = "STUDENT") {
  const db = await connect(),
    id = randomUUID();
  await db.execute(
    "INSERT INTO users(id,name,email,password_hash,role,onboarded) VALUES (?,? ,?,'unused',?,1)",
    [id, "Agent browser fixture", `${id}@agent.test`, role],
  );
  await db.execute("INSERT INTO user_preferences(user_id) VALUES (?)", [id]);
  await db.execute(
    "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'family',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))",
    [randomUUID(), id],
  );
  if (role === "STUDENT")
    await db.execute("INSERT INTO student_profiles(user_id) VALUES (?)", [id]);
  const models: Record<string, string> = {};
  for (const company of ["GEMINI", "OPENAI", "ANTHROPIC", "COMPATIBLE"]) {
    const modelId = randomUUID();
    models[company] = modelId;
    await db.execute(
      "INSERT INTO ai_models(id,owner_id,company,label,model,key_cipher,key_last_four,base_url,input_price,output_price) VALUES (?,?,?,?,?,?,?, ?,1,2)",
      [
        modelId,
        id,
        company,
        "Temporary " + company,
        "fixture-model",
        encrypt("agent-e2e-valid"),
        "alid",
        company === "COMPATIBLE" ? "https://api.deepseek.com/v1" : null,
      ],
    );
  }
  const token = await new SignJWT({ version: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
  await page
    .context()
    .addCookies([
      {
        name: "finbridge_session",
        value: token,
        url: process.env.TEST_URL || "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  return {
    id,
    db,
    models,
    async close() {
      await db.execute(
        "UPDATE agent_action_requests SET status='CANCELLED' WHERE user_id=? AND status='PENDING'",
        [id],
      );
      await db.execute("DELETE FROM ai_models WHERE owner_id=?", [id]);
      await db.execute(
        "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id=?",
        [id],
      );
      await db.end();
    },
  };
}
async function send(page: Page, message: string) {
  await page.locator(".agent-composer textarea").fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
test("AI page: four providers, contextual continuation, confirmation, persistence, usage and errors", async ({
  page,
}) => {
  const user = await fixture(page);
  try {
    await page.goto("/en/agent");
    await expect(page.locator('.sidebar a[href="/en/api-keys"]')).toBeVisible();
    for (const company of ["GEMINI", "OPENAI", "ANTHROPIC", "COMPATIBLE"]) {
      await page
        .getByLabel("Previous conversations", { exact: true })
        .selectOption("");
      await page
        .getByLabel("Selected AI model", { exact: true })
        .selectOption(user.models[company]);
      await send(page, "Plan Housing CNY 123.45");
      await expect(
        page.getByText("Which month?", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "2026-12", exact: true }).click();
      await expect(page.locator(".agent-action-review")).toBeVisible();
      const [before] = await user.db.execute<mysql.RowDataPacket[]>(
        "SELECT amount FROM budgets WHERE user_id=?",
        [user.id],
      );
      if (company === "GEMINI") expect(before).toHaveLength(0);
      await page
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await expect(page.locator(".agent-action-review")).toContainText(
        "Completed",
      );
      const [budget] = await user.db.execute<mysql.RowDataPacket[]>(
        "SELECT amount,month FROM budgets WHERE user_id=?",
        [user.id],
      );
      expect(budget[0]).toMatchObject({ amount: "123.45", month: "2026-12" });
      await page.reload();
      await expect(page.getByLabel("Conversation history")).toContainText(
        "Plan Housing",
      );
      await expect(page.locator(".agent-action-review")).toContainText(
        "Completed",
      );
    }
    await expect(page.locator(".agent-usage")).toContainText("0.000");
    await expect(page.locator(".agent-usage")).toContainText(
      "x-ratelimit-remaining-requests",
    );
    const saved = await page
      .getByLabel("Previous conversations", { exact: true })
      .inputValue();
    await user.db.execute("UPDATE ai_models SET key_cipher=? WHERE id=?", [
      encrypt("agent-e2e-invalid"),
      user.models.COMPATIBLE,
    ]);
    await send(page, "Continue the current task");
    await expect(page.locator(".agent-content [role=alert]")).toContainText(
      /key|credential/i,
    );
    await page.reload();
    await expect(page.getByLabel("Conversation history")).toContainText(
      "Plan Housing",
    );
    const [links] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT c.previous_run_id FROM agent_conversation_turns c JOIN agent_runs r ON r.id=c.run_id WHERE r.user_id=? AND r.status='FAILED'",
      [user.id],
    );
    expect(links.some((r) => r.previous_run_id === saved)).toBeTruthy();
    const response = await page.request.get(
      "/api/agent/progress?runId=not-owned",
    );
    expect(response.status()).toBe(404);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "test-results/agent-mobile.png",
      fullPage: true,
    });
  } finally {
    await user.close();
  }
});
test("API Keys reuses encrypted model management for Claude and compatible providers", async ({
  page,
}) => {
  const user = await fixture(page);
  try {
    await page.goto("/en/api-keys");
    await page.getByRole("button", { name: "Add AI model" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Label", { exact: false }).fill("Claude UI test");
    await dialog.getByLabel("Company", { exact: false }).click();
    await page
      .getByRole("option", { name: "Anthropic Claude", exact: true })
      .click();
    await dialog.getByLabel("Model ID", { exact: false }).fill("fixture-model");
    await dialog
      .getByLabel("API key", { exact: false })
      .fill("agent-e2e-valid");
    await dialog.getByLabel("Input price", { exact: false }).fill("1");
    await dialog.getByLabel("Output price", { exact: false }).fill("2");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    const [models] = await user.db.execute<mysql.RowDataPacket[]>(
      "SELECT company,key_cipher,input_price,output_price FROM ai_models WHERE owner_id=? AND label='Claude UI test'",
      [user.id],
    );
    expect(models[0].company).toBe("ANTHROPIC");
    expect(models[0].key_cipher).not.toContain("agent-e2e-valid");
    expect(Number(models[0].input_price)).toBe(1);
    expect(Number(models[0].output_price)).toBe(2);
    expect(await page.locator("body").innerText()).not.toContain(
      "agent-e2e-valid",
    );
  } finally {
    await user.close();
  }
});
test("Parent and Admin can use the agent without gaining student tools", async ({
  page,
}) => {
  for (const role of ["PARENT", "ADMIN"]) {
    const user = await fixture(page, role);
    try {
      await page.goto("/en/agent");
      await expect(
        page.getByLabel("Selected AI model", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Selected AI model", { exact: true })
        .selectOption(user.models.OPENAI);
      await send(page, "Plan Housing CNY 123.45");
      await expect(
        page.getByText("Which month?", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "2026-12", exact: true }).click();
      await expect(page.locator(".agent-action-review")).toHaveCount(0);
      const [budgets] = await user.db.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM budgets WHERE user_id=?",
        [user.id],
      );
      expect(budgets).toHaveLength(0);
    } finally {
      await user.close();
    }
  }
});
