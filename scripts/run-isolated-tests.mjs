import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
try { process.loadEnvFile(".env.local"); } catch { /* CI environment */ }
const {database} = JSON.parse(readFileSync(".local/test-database.json","utf8"));
if (!/^finbridge_test_\d+$/.test(database)) throw new Error("Refusing a non-test database");
const env = {...process.env, DB_NAME:database, DEMO_MODE:"true", PAYMENT_CONFIG_SOURCE:"environment",
  LIVE_PAYMENTS_ENABLED:"false", PAYMENTS_SUSPENDED:"true", LIVE_MERCHANT_APPROVALS:"[]",
  SESSION_SECRET:"isolated-test-session-secret-at-least-32-characters",
  AI_KEY_ENCRYPTION_SECRET:"isolated-test-encryption-secret-at-least-32-characters"};
for (const key of Object.keys(env)) if (/(PAYPAL|STRIPE|OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|AGENT_LIVE_MODEL_ID)/.test(key)) env[key]="";
const mode=process.argv[2] || "integration";
const args = mode === "browser" ? ["node_modules/@playwright/test/cli.js","test",...process.argv.slice(3)] :
  mode === "server" ? ["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3101"] :
  ["--conditions=react-server","--import","tsx","--test","--test-concurrency=1",...(mode==="unit" ? ["tests/*.test.ts"] : process.argv.length>3 ? process.argv.slice(3) : ["tests/payments.integration.ts","tests/billing.integration.ts","tests/commerce.integration.ts","tests/entitlements.integration.ts","tests/agent.integration.ts","tests/isolation.integration.ts","tests/demo-reset.integration.ts","tests/wallet-workflows.integration.ts","tests/admin-bootstrap.integration.ts","tests/required-changes.integration.ts"])];
env.TEST_URL="http://127.0.0.1:3101";
env.CHECKOUT_BASE_URL=env.TEST_URL;
const child=spawn(process.execPath,args,{env,stdio:"inherit"});
child.on("exit",code=>{process.exitCode=code ?? 1;});
