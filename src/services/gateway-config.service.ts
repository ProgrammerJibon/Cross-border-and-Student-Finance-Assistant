import "server-only";
import { rows } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";
export type Environment = "sandbox" | "live";
export type GatewayConfig = {
  paypalClientId?: string; paypalSecret?: string; paypalWebhookId?: string;
  stripeSecret?: string; stripeWebhookSecret?: string;
  buyerEmail?: string; buyerPassword?: string;
};
export async function gatewayConfig(environment: Environment): Promise<GatewayConfig> {
  const [saved] = await rows<{ config_cipher: string }>("SELECT config_cipher FROM payment_gateway_config WHERE environment=?", [environment]);
  const prefix = environment === "live" ? "LIVE_" : "";
  return {
    paypalClientId:
      process.env[`${prefix}PAYPAL_CLIENT_ID`] ||
      (environment === "sandbox"
        ? process.env.PAYPAL_SANDBOX_CLIENT_ID
        : process.env.PAYPAL_LIVE_CLIENT_ID),
    paypalSecret:
      process.env[`${prefix}PAYPAL_CLIENT_SECRET`] ||
      (environment === "sandbox"
        ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET
        : process.env.PAYPAL_LIVE_CLIENT_SECRET),
    paypalWebhookId:
      process.env[`${prefix}PAYPAL_WEBHOOK_ID`] ||
      (environment === "sandbox"
        ? process.env.PAYPAL_SANDBOX_WEBHOOK_ID
        : process.env.PAYPAL_LIVE_WEBHOOK_ID),
    stripeSecret:
      process.env[`${prefix}STRIPE_SECRET_KEY`] ||
      (environment === "sandbox"
        ? process.env.STRIPE_TEST_SECRET_KEY
        : process.env.STRIPE_LIVE_SECRET_KEY),
    stripeWebhookSecret:
      process.env[`${prefix}STRIPE_WEBHOOK_SECRET`] ||
      (environment === "sandbox"
        ? process.env.STRIPE_TEST_WEBHOOK_SECRET
        : process.env.STRIPE_LIVE_WEBHOOK_SECRET),
    ...(saved ? JSON.parse(decryptSecret(saved.config_cipher)) : {}),
  };
}
export async function gatewayOptions(environment: Environment) {
  const c = await gatewayConfig(environment);
  return {
    environment,
    providers: {
      STRIPE: (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      ALIPAY: (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      WECHAT: (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      UNIONPAY: (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      PAYPAL: !!(c.paypalClientId && c.paypalSecret),
    },
    testBuyer: environment === "sandbox" ? { email: c.buyerEmail || "", password: c.buyerPassword || "" } : null,
  };
}
