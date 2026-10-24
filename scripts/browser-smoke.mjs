import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir(".local/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:3000/en/demo", {
  waitUntil: "networkidle",
  timeout: 180000,
});
await page.getByRole("button", { name: /Student Premium/ }).click();
await page.waitForURL("**/dashboard", { timeout: 120000 });
await page.waitForLoadState("networkidle");
await page.screenshot({
  path: ".local/screenshots/dashboard-desktop.png",
  fullPage: true,
});
console.log("URL", page.url(), "errors", errors);
console.log((await page.locator("main").innerText()).slice(0, 1400));
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: ".local/screenshots/dashboard-mobile.png",
  fullPage: true,
});
console.log(
  "Mobile width",
  await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  })),
);
await browser.close();
