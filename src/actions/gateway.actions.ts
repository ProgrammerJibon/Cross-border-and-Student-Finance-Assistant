"use server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { atomic, rows, write } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { audit } from "@/lib/audit";
import { gatewayConfig, type GatewayConfig } from "@/services/gateway-config.service";
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
    const v = z.object({ environment: environmentSchema, paypalClientId: secret, paypalSecret: secret, paypalWebhookId: secret, stripeSecret: secret, stripeWebhookSecret: secret, buyerEmail: secret, buyerPassword: secret }).parse(input);
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
