import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
test("landing banner persists, language menu uses SVG, payment logos and favicon render", async ({
  page,
}) => {
  await page.goto("/en");
  await expect(
    page.getByText("Demo for Shenzhen FinTech Competition 2026 in China."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss competition banner" })
    .click();
  await page.reload();
  await expect(page.locator(".competition-banner")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Language" }).click();
  await expect(page.getByRole("option").locator("svg")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator(".language-flag")).toHaveCount(0);
  await expect(page.locator(".supported-payments .payment-logo")).toHaveCount(
    7,
  );
  const icon = await page
    .locator('link[rel="icon"]')
    .first()
    .getAttribute("href");
  expect(icon).toContain("icon.svg");
  expect((await page.request.get(icon!)).ok()).toBeTruthy();
});
test("notification resubscribe saves device registration and account preference", async ({
  page,
  context,
}) => {
  const deviceId = randomUUID();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    await context.grantPermissions(["notifications"], {
      origin: "http://127.0.0.1:3000",
    });
    await page.goto("/en/demo");
    await page.evaluate(
      (id) => localStorage.setItem("finbridge:notification-device", id),
      deviceId,
    );
    await page
      .locator(".demo-profile")
      .filter({
        has: page.getByRole("heading", { name: "Student Free", exact: true }),
      })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("button", { name: /Notifications:/ }).click();
    await page
      .getByRole("button", { name: "Notification Resubscribe", exact: true })
      .click();
    await expect(
      page.getByText(
        /^Notification settings saved for this device and your account\./,
      ),
    ).toBeVisible();
    const [result] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT d.permission,p.notifications FROM notification_devices d JOIN user_preferences p ON p.user_id=d.user_id WHERE d.device_id=?",
      [deviceId],
    );
    expect(result).toHaveLength(1);
    expect(result[0].permission).toBe("granted");
    expect(result[0].notifications).toBe(1);
  } finally {
    await db.execute("DELETE FROM notification_devices WHERE device_id=?", [
      deviceId,
    ]);
    await db.end();
  }
});
test("scrolling and hovering evidence bars does not crash; demos cannot upgrade", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/demo");
  await expect(
    page.getByRole("heading", { name: "Student Premium", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".demo-profile")
    .filter({
      has: page.getByRole("heading", { name: "Student Free", exact: true }),
    })
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/en/subscription/checkout?plan=student");
  await expect(
    page.getByText(
      "Demo accounts stay Free for testing. Plan changes and purchases are disabled.",
    ),
  ).toBeVisible();
  await expect(page.locator(".provider-checkout")).toHaveCount(0);
  await page.getByRole("button", { name: /Notifications:/ }).click();
  await expect(
    page.getByRole("button", {
      name: /Enable device notifications|Notification Resubscribe/i,
    }),
  ).toBeVisible();
  await page.goto("/en/demo");
  await page.locator(".demo-profile").last().click();
  await expect(page).toHaveURL(/admin/);
  await page.goto("/en/project-evidence");
  const chart = page.locator(".chart").first();
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator("svg").first()).toBeVisible();
  await chart.hover({ position: { x: 140, y: 100 } });
  await page.mouse.wheel(0, 1500);
  await page.mouse.wheel(0, -1500);
  await chart.hover({ position: { x: 200, y: 150 } });
  await expect(page.locator(".main-content")).toBeVisible();
  expect(errors).toEqual([]);
});
