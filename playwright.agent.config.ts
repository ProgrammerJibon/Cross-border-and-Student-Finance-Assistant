import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
process.env.AGENT_E2E_FIXTURES = "1";
export default defineConfig({
  ...base,
  testMatch: "agent.spec.ts",
  use: { ...base.use, baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command:
      "node --import ./tests/agent-provider-fixture.mjs node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/en/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: { NODE_OPTIONS: "--import ./tests/agent-provider-fixture.mjs" },
  },
});
