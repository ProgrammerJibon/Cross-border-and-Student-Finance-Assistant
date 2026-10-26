import "server-only";
import { z } from "zod";
import { rows } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";
import { parseJson } from "@/lib/json";
import { requireCondition } from "@/lib/errors";
import { approvalSchema, eligiblePayment } from "@/lib/payment-capabilities";
export type Environment = "sandbox" | "live";
export type GatewayConfig = {
  paypalClientId?: string; paypalSecret?: string; paypalWebhookId?: string;
  stripePublishableKey?: string; stripeSecret?: string; stripeWebhookSecret?: string;
  buyerEmail?: string; buyerPassword?: string;
};
const gatewayConfigSchema = z.object({
  paypalClientId: z.string().optional(),
  paypalSecret: z.string().optional(),
  paypalWebhookId: z.string().optional(),
  stripePublishableKey: z.string().optional(),
  stripeSecret: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  buyerEmail: z.string().optional(),
  buyerPassword: z.string().optional(),
});
export function decodeGatewayConfig(cipher: string): GatewayConfig {
  const config = gatewayConfigSchema.safeParse(
    parseJson<unknown>(decryptSecret(cipher), null),
  );
  requireCondition(config.success, "CHECKOUT_NOT_CONFIGURED");
  return config.data;
}
export async function gatewayConfig(environment: Environment): Promise<GatewayConfig> {
  const [saved] = process.env.PAYMENT_CONFIG_SOURCE === "environment" ? [] : await rows<{ config_cipher: string }>("SELECT config_cipher FROM payment_gateway_config WHERE environment=?", [environment]);
  const prefix = environment === "live" ? "LIVE_" : "";
  return {
    stripePublishableKey: process.env[`${prefix}STRIPE_PUBLISHABLE_KEY`] || process.env[environment === "sandbox" ? "STRIPE_TEST_PUBLISHABLE_KEY" : "STRIPE_LIVE_PUBLISHABLE_KEY"],
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
    ...(saved ? decodeGatewayConfig(saved.config_cipher) : {}),
  };
}
export async function gatewayOptions(environment: Environment, context?: {operation: string; customerCountry: string; currency: string}) {
  const c = await gatewayConfig(environment);
  let approvals: import("@/lib/payment-capabilities").MerchantApproval[] = [];
  try { approvals = approvalSchema.array().parse(JSON.parse(process.env.LIVE_MERCHANT_APPROVALS || "[]")); }
  catch { /* Invalid approval configuration disables all Live methods. */ }
  const allowed = (provider: string) => environment === "sandbox" || !!context && eligiblePayment({
    provider, ...context, approvals, suspended: process.env.LIVE_PAYMENTS_ENABLED !== "true" || process.env.PAYMENTS_SUSPENDED === "true",
  });
  return {
    environment,
    providers: {
      STRIPE: allowed("STRIPE") && (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      ALIPAY: allowed("ALIPAY") && (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      WECHAT: allowed("WECHAT") && (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      UNIONPAY: allowed("UNIONPAY") && (environment === "live" ? /^sk_live_/ : /^sk_test_/).test(c.stripeSecret || ""),
      PAYPAL: allowed("PAYPAL") && !!(c.paypalClientId && c.paypalSecret),
    },
    testBuyer: null,
  };
}
