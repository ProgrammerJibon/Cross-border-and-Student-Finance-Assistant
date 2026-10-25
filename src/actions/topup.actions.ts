"use server";
import { requireUser } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { prepareGatewayTopup } from "@/services/gateway-topup.service";
import { getTopupQuote, initiateTopup } from "@/services/topup-checkout.service";
async function owner() {
  const u=await requireUser();
  requireCondition(["STUDENT","PARENT"].includes(u.role),"FORBIDDEN");
  return u.id;
}
export async function prepareTopup(input:unknown) {
  return action(async()=>({requestId:(await prepareGatewayTopup(await owner(),input)).id}));
}
export async function topupOptions(input:unknown) {
  return action(async()=>getTopupQuote(await owner(),input));
}
export async function startTopupCheckout(input:unknown) {
  return action(async()=>initiateTopup(await owner(),input));
}
