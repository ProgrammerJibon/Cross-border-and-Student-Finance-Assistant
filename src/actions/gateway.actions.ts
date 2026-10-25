"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { atomic, rows, write } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { audit } from "@/lib/audit";
import { gatewayConfig, type GatewayConfig } from "@/services/gateway-config.service";
import { checkoutOrigin, paypal, stripe } from "@/services/checkout-provider.service";
const environmentSchema = z.enum(["sandbox", "live"]);
export async function getGatewaySettings(environment: unknown) {
  return action(async () => {
    const u = await requireAdmin("payment-methods");
    requireCondition(!u.is_demo || environment === "sandbox", "ENVIRONMENT_MISMATCH");
    const config = await gatewayConfig(environmentSchema.parse(environment));
    return Object.fromEntries(Object.entries(config).map(([k,v]) => [k, !!v]));
  });
}
export async function saveGatewaySettings(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("payment-methods");
    const secret = z.string().trim().max(2000).default("");
    const v = z.object({ environment: environmentSchema, paypalClientId: secret, paypalSecret: secret, paypalWebhookId: secret, stripePublishableKey: secret, stripeSecret: secret, stripeWebhookSecret: secret }).superRefine((v, ctx) => {
      for (const [key, pattern] of [["stripeSecret", v.environment === "live" ? /^sk_live_/ : /^sk_test_/], ["stripePublishableKey", v.environment === "live" ? /^pk_live_/ : /^pk_test_/], ["stripeWebhookSecret", /^whsec_/]] as const) {
        if (v[key] && !pattern.test(v[key])) ctx.addIssue({code:"custom",path:[key],message:`Use a valid ${v.environment} ${key}.`});
      }
    }).parse(input);
    requireCondition(!u.is_demo, "LIVE_ADMIN_REQUIRED");
    await atomic(async db => {
      const [old] = await rows<{config_cipher: string}>("SELECT config_cipher FROM payment_gateway_config WHERE environment=? FOR UPDATE", [v.environment],db);
      const config: GatewayConfig = old ? JSON.parse(decryptSecret(old.config_cipher)) : {};
      for (const [k,value] of Object.entries(v)) if(k !== "environment" && value) config[k as keyof GatewayConfig] = value;
      if(config.stripeSecret) z.string().regex(v.environment === "live" ? /^sk_live_/ : /^sk_test_/).parse(config.stripeSecret);
      await write("INSERT INTO payment_gateway_config(environment,config_cipher) VALUES (?,?) ON DUPLICATE KEY UPDATE config_cipher=VALUES(config_cipher)", [v.environment,encryptSecret(JSON.stringify(config))],db);
      await audit(u.id,"GATEWAY_CONFIG_UPDATED","payment_gateway_config",v.environment,{},db);
    });
    return null;
  });
}
export async function testGatewaySettings(environment: unknown) {
  return action(async () => {
    const u = await requireAdmin("payment-methods");
    const mode = environmentSchema.parse(environment);
    requireCondition(!u.is_demo || mode === "sandbox", "ENVIRONMENT_MISMATCH");
    const config = await gatewayConfig(mode);
    const probe = async (provider: "STRIPE" | "PAYPAL") => {
      const configured = provider === "STRIPE" ? !!(config.stripeSecret && config.stripePublishableKey && config.stripeWebhookSecret) : !!(config.paypalClientId && config.paypalSecret && config.paypalWebhookId);
      if (!configured) return "Missing credentials or webhook configuration.";
      try {
        if (provider === "STRIPE") await stripe("/account",undefined,undefined,mode);
        else await paypal("/v1/notifications/webhooks/" + encodeURIComponent(config.paypalWebhookId!),"GET",undefined,undefined,mode);
        return "Provider authenticated. Checkout and webhook delivery still need an end-to-end test.";
      } catch { return "Provider authentication or webhook lookup failed. Check the configured credentials and environment."; }
    };
    return { STRIPE: await probe("STRIPE"), PAYPAL: await probe("PAYPAL"),
      funding: mode === "live" ? "Live wallet funding blocked: no approved wallet-funding settlement partner is integrated. Merchant checkout credentials alone cannot activate it." : "Sandbox payments credit Demo wallets only.",
      stripeWebhook: `${checkoutOrigin()}/api/billing/stripe?environment=${mode}`,
      paypalWebhook: `${checkoutOrigin()}/api/billing/paypal?environment=${mode}`,
    };
  });
}
