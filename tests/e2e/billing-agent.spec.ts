import { test, expect } from "@playwright/test";

test("Free/Premium demos, PayPal-first checkout, footer methods and editable agent requests", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/en/pricing");
  await expect(
    page.getByRole("heading", { name: "Student Free", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Student Premium", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".supported-payments li").first()).toHaveText(
    "PayPal",
  );
  await expect(page.locator(".supported-payments")).toContainText("UnionPay");
  await page.goto("/en/demo");
  await expect(page.locator(".demo-profile")).toHaveCount(4);
  await page
    .locator(".demo-profile")
    .filter({
      has: page.getByRole("heading", { name: "Student Free", exact: true }),
    })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto("/en/subscription");
  await expect(page.locator(".main-content > .card").first()).toContainText(
    "Student Free",
  );
  await expect(page.locator(".main-content > .card").first()).toContainText(
    "no expiry",
  );
  await page.goto("/en/demo");
  await page
    .locator(".demo-profile")
    .filter({
      has: page.getByRole("heading", { name: "Student Premium", exact: true }),
    })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto("/en/subscription");
  await expect(page.locator(".main-content > .card").first()).toContainText(
    "Student Premium",
  );
  await page.goto("/en/subscription/checkout?plan=student");
  await expect(page.getByRole("radio").first()).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radio").first()).toContainText("PayPal");
  await expect(page.locator(".checkout-total")).toContainText("USD");
  await page.getByRole("radio").filter({ hasText: "UnionPay" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with UnionPay / cards" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yearly", exact: true }).click();
  await expect(page.locator(".checkout-total")).toContainText("USD");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `.local/screenshots/provider-checkout-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto("/en/agent");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Build a personalized request" })
    .click();
  await page
    .locator(".agent-starter")
    .getByLabel("Amount", { exact: true })
    .fill("1500");
  await page
    .locator(".agent-starter")
    .getByLabel("Details (optional)")
    .fill("Tuition due next month");
  await page.getByRole("button", { name: "Prepare my request" }).click();
  await expect(page.locator(".agent-composer textarea")).toHaveValue(
    /1500 USD/,
  );
  await expect(page.locator(".agent-composer textarea")).toHaveValue(
    /Tuition due next month/,
  );
  await expect(page.locator(".working-state")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `.local/screenshots/agent-interactive-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
});
