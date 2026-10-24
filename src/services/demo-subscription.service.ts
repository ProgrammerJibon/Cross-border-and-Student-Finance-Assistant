import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, rows, write } from "@/lib/db";
import { requireDemoFinance } from "@/lib/financial-environment";
import { requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";

export async function simulateDemoSubscription(userId: string, input: unknown) {
  const v=z.object({id:z.uuid(),plan:z.enum(["student-free","student","family","family-pro"])}).parse(input);
  return atomic(async db=>{
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[userId],db);
    const user=await requireDemoFinance(userId,db);
    requireCondition(user.role==="STUDENT" ? ["student-free","student"].includes(v.plan) : user.role==="PARENT" && ["family","family-pro"].includes(v.plan),"PLAN_NOT_ALLOWED");
    const [old]=await rows<{user_id:string;plan_id:string}>("SELECT user_id,plan_id FROM demo_payments WHERE id=?",[v.id],db);
    if(old) {requireCondition(old.user_id===userId && old.plan_id===v.plan,"NOT_FOUND");return {status:"SIMULATED"};}
    const [price]=await rows<{monthly:string;currency:string}>("SELECT pr.monthly,pr.currency FROM plan_prices pr JOIN plans p ON p.id=pr.plan_id WHERE pr.plan_id=? AND p.active=1",[v.plan],db);
    requireCondition(price,"NOT_FOUND");
    await write("INSERT INTO demo_payments(id,user_id,plan_id,amount,currency,last_four,status,reference) VALUES (?,?,?,?,?,'0000','SIMULATED',?)",[v.id,userId,v.plan,price.monthly,price.currency,`DEMO-${v.id}`],db);
    await write("INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'ACTIVE',UTC_TIMESTAMP(),'2099-12-31') ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status='ACTIVE',ends_at='2099-12-31'",[randomUUID(),userId,v.plan],db);
    await audit(userId,"SIMULATED_SUBSCRIPTION","demo_payments",v.id,{notice:"SIMULATED — NO REAL MONEY"},db);
    return {status:"SIMULATED"};
  });
}
