import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Read-only authentication probes. Do not create orders, capture payments or
// print secrets/provider response bodies.
const checks = [
  [
    "PayPal sandbox",
    async () => {
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
        return "NOT CONFIGURED";
      const response = await fetch(
        "https://api-m.sandbox.paypal.com/v1/oauth2/token",
        {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
      );
      return response.ok
        ? "AUTHENTICATED"
        : `AUTHENTICATION FAILED (${response.status})`;
    },
  ],
  [
    "Stripe test / UnionPay",
    async () => {
      if (!process.env.STRIPE_SECRET_KEY) return "NOT CONFIGURED";
      if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_"))
        return "REJECTED: test key required";
      const response = await fetch("https://api.stripe.com/v1/account", {
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      if (!response.ok) return `AUTHENTICATION FAILED (${response.status})`;
      const data = await response.json();
      return `AUTHENTICATED (merchant country: ${data.country || "unknown"}; confirm UnionPay eligibility with Stripe)`;
    },
  ],
];
for (const [name, check] of checks) {
  try {
    const result = await check();
    console.log(`${name}: ${result}`);
    if (!result.startsWith("AUTHENTICATED")) process.exitCode = 1;
  } catch {
    console.log(`${name}: CONNECTION FAILED`);
    process.exitCode = 1;
  }
}
