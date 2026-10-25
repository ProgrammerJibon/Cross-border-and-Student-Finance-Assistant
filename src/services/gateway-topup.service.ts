import "server-only";
import { z } from "zod";
import { amount, id } from "@/lib/validation";
import { checkoutEnvironment, requireDemoFinance } from "@/lib/financial-environment";
import { gatewayConfig, gatewayOptions } from "./gateway-config.service";
import { createPaymentDraft } from "./payment.service";
import { rows } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
export async function prepareGatewayTopup(userId: string, input: unknown) {
  const v = z.object({ id: z.uuid(), account_id: id, amount, provider: z.enum(["STRIPE","PAYPAL"]) }).parse(input);
  const environment = await checkoutEnvironment(userId);
  await requireDemoFinance(userId);
  const config = await gatewayConfig(environment);
  requireCondition((await gatewayOptions(environment)).providers[v.provider] && (v.provider === "STRIPE" ? config.stripeWebhookSecret : config.paypalWebhookId), "CHECKOUT_NOT_CONFIGURED");
  const [wallet] = await rows<{currency:string}>("SELECT currency FROM accounts WHERE id=? AND user_id=? AND archived=0 AND type<>'CASH'",[v.account_id,userId]);
  requireCondition(wallet,"NOT_FOUND");
  return createPaymentDraft(userId,{kind:"TOPUP",method:v.provider,account_id:v.account_id,amount:v.amount,receive_currency:wallet.currency,recipient:"",destination:"",beneficiary_id:null,category:"Other",note:"Provider-hosted sandbox checkout"},v.id);
}
