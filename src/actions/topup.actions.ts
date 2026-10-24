"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { rows, write, atomic, type DB } from "@/lib/db";
import { gatewayOptions, type Environment } from "@/services/gateway-config.service";
import { createProviderCheckout, type Checkout, type Provider } from "@/services/checkout-provider.service";
import { getRates } from "@/services/currency.service";
import { convert, D } from "@/lib/money";
import { checkoutEnvironment, requireDemoFinance } from "@/lib/financial-environment";
const inputSchema=z.object({requestId:z.string().max(64),environment:z.enum(["sandbox","live"]).optional()});
async function quote(userId:string,requestId:string,environment:Environment,db?:DB) {
  await checkoutEnvironment(userId, environment, db);
  // Merchant capture is not wallet settlement. No approved funding rail exists.
  await requireDemoFinance(userId, db);
  const [r]=await rows<{amount:string;currency:string;method:Provider;status:string;kind:string}>("SELECT * FROM financial_requests WHERE id=? AND user_id=?",[requestId,userId],db);
  requireCondition(r && r.kind === "TOPUP" && ["UNIONPAY","STRIPE","PAYPAL","ALIPAY","WECHAT"].includes(r.method),"NOT_FOUND");
  const [old]=await rows<Checkout>("SELECT * FROM provider_checkouts WHERE request_id=?",[requestId],db);
  if(old) {
    requireCondition(old.environment===environment,"CHECKOUT_ENVIRONMENT_LOCKED");
    return {amount:old.amount,currency:old.currency,provider:r.method};
  }
  requireCondition(r.status === "DRAFT","INVALID_STATE");
  const rates=await getRates(db);
  requireCondition(D(rates[r.currency] || 0).gt(0) && D(rates.USD || 0).gt(0),"CHECKOUT_CURRENCY_UNAVAILABLE");
  const amount=convert(r.amount,rates[r.currency],rates.USD);
  requireCondition(D(amount).gte("0.50"),"CHECKOUT_CURRENCY_UNAVAILABLE");
  return {amount,currency:"USD",provider:r.method};
}
export async function topupOptions(input:unknown) {
  return action(async()=>{
    const u=await requireUser();requireCondition(!u.is_demo,"DEMO_PLAN_LOCKED");
    const parsed=inputSchema.parse(input);
    const v={...parsed, environment:await checkoutEnvironment(u.id, parsed.environment)};
    return {...await quote(u.id,v.requestId,v.environment),...await gatewayOptions(v.environment)};
  });
}
export async function startTopupCheckout(input:unknown) {
  return action(async()=>{
    const u=await requireUser();requireCondition(!u.is_demo,"DEMO_PLAN_LOCKED");
    const parsed=inputSchema.extend({locale:z.enum(["en","bn-BD","zh-CN"]),amount:z.string(),currency:z.literal("USD")}).parse(input);
    const v={...parsed, environment:await checkoutEnvironment(u.id, parsed.environment)};
    const c=await atomic(async db=>{
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[u.id],db);
      const q=await quote(u.id,v.requestId,v.environment,db);
      requireCondition(q.amount===v.amount && q.currency===v.currency,"CHECKOUT_PRICE_CHANGED");
      const [old]=await rows<Checkout>("SELECT * FROM provider_checkouts WHERE request_id=?",[v.requestId],db);
      if(old) return old;
      const id=randomUUID();
      const [count]=await rows<{n:number}>("SELECT COUNT(*) n FROM provider_checkouts WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)",[u.id],db);
      requireCondition(count.n<20,"RATE_LIMITED");
      await write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,purpose,request_id) VALUES (?,?,'student-free','once',?,?,?,?,'TOPUP',?)",[id,u.id,q.provider,q.amount,q.currency,v.environment,v.requestId],db);
      await write("UPDATE financial_requests SET status='PROCESSING',confirmed_at=UTC_TIMESTAMP() WHERE id=?",[v.requestId],db);
      return {id,user_id:u.id,plan_id:"student-free",cycle:"once",provider:q.provider,amount:q.amount,currency:q.currency,environment:v.environment,purpose:"TOPUP",request_id:v.requestId,remote_id:null,approval_url:null,status:"CREATED"} satisfies Checkout;
    });
    requireCondition((await gatewayOptions(v.environment)).providers[c.provider],"CHECKOUT_NOT_CONFIGURED");
    if(c.approval_url) return {id:c.id,url:c.approval_url};
    const remote=await createProviderCheckout(c,v.locale);
    await write("UPDATE provider_checkouts SET remote_id=?,approval_url=? WHERE id=?",[remote.id,remote.url,c.id]);
    return {id:c.id,url:remote.url};
  });
}
