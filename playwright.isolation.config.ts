import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: ["commerce-update.spec.ts","wallet-workflows.spec.ts","landing-payments.spec.ts"],
  use: {...base.use, baseURL:"http://127.0.0.1:3101"},
  webServer: {
    command:"node scripts/run-isolated-tests.mjs server",
    url:"http://127.0.0.1:3101/en/login",
    reuseExistingServer: !process.env.CI,
    timeout:120000,
  },
});
