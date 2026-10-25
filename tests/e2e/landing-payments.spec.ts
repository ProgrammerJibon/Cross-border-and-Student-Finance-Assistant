import { test, expect } from "@playwright/test";

test("payment brands appear on the localized root landing page only", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);
  const strip = page.locator(".supported-payments");
  for (const name of ["UnionPay", "Stripe", "Alipay", "WeChat Pay", "PayPal", "Visa", "Mastercard"]) {
    await expect(strip.getByRole("img", { name, exact: true })).toBeVisible();
  }
  await expect(strip.locator("strong")).toHaveText("Payment brands");
  await expect(strip.locator("p")).toHaveCount(0);
  await expect(strip.locator(".payment-logo")).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(strip).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const path of ["/en/features", "/en/pricing", "/en/login"]) {
    await page.goto(path);
    await expect(page.locator(".supported-payments")).toHaveCount(0);
  }
});
