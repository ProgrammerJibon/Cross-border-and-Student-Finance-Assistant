import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const { rows,write,pool }=await import("../src/lib/db");
const {fulfillCheckout}=await import("../src/services/billing.service");
const {cancelUserRenewals}=await import("../src/services/recurring.service");
test("hosted top-ups and recurring invoices settle once and cancellation reaches Stripe",async t=>{
  const user=`commerce-${randomUUID()}`,account=randomUUID(),request=randomUUID(),topup=randomUUID(),subscription=randomUUID();
  const original=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY="sk_test_fixture";
  let invoice="in_first",until=Math.floor(Date.now()/1000)+30*86400,cancelled=false;
  try {
    await write("INSERT INTO users(is_demo,id,name,email,password_hash,role) VALUES (1,?, 'Commerce test',?,'fixture','STUDENT')",[user,`${user}@example.test`]);
    await write("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student-free',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),user]);
    await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Test','BANK','CNY',0)",[account,user]);
    await write("INSERT INTO financial_requests(id,user_id,account_id,kind,method,amount,currency,recipient,destination,receive_amount,receive_currency,fx_rate,status,idempotency_key) VALUES (?,?,?,'TOPUP','STRIPE',100,'CNY','','',100,'CNY',1,'PROCESSING',?)",[request,user,account,request]);
    await write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,remote_id,purpose,request_id) VALUES (?,?,'student-free','once','STRIPE',10,'USD',?,'TOPUP',?)",[topup,user,`cs_${topup}`,request]);
    await write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,remote_id,recurring) VALUES (?,?,'student','monthly','STRIPE',3,'USD',?,1)",[subscription,user,`cs_${subscription}`]);
    t.mock.method(globalThis,"fetch",async(url: string,init:RequestInit)=>{
      if(url.includes(`/subscriptions/sub_${subscription}`)) {cancelled=new URLSearchParams(String(init.body)).get("cancel_at_period_end")==="true";return Response.json({id:`sub_${subscription}`})}
      const isTopup=url.includes(topup);const id=isTopup?topup:subscription;
      return Response.json({id:`cs_${id}`,livemode:false,status:"complete",payment_status:"paid",amount_total:isTopup?1000:300,currency:"usd",client_reference_id:id,metadata:{checkout_id:id},payment_intent:`pi_${id}`,
        subscription:isTopup?null:{id:`sub_${id}`,status:"active",metadata:{checkout_id:id},latest_invoice:{id:invoice,status:"paid",currency:"usd",amount_paid:300,lines:{data:[{period:{end:until}}]}}}});
    });
    await assert.rejects(fulfillCheckout(topup,"not-owner"),{message:"NOT_FOUND"});
    await Promise.all([fulfillCheckout(topup,user),fulfillCheckout(topup,user)]);
    assert.equal((await rows("SELECT balance FROM accounts WHERE id=?",[account]))[0].balance,"100.00");
    assert.equal(Number((await rows("SELECT COUNT(*) n FROM transactions WHERE user_id=?",[user]))[0].n),1);
    await Promise.all([fulfillCheckout(subscription,user),fulfillCheckout(subscription,user)]);
    assert.equal((await rows("SELECT plan_id FROM subscriptions WHERE user_id=?",[user]))[0].plan_id,"student");
    assert.equal(Number((await rows("SELECT COUNT(*) n FROM provider_renewals WHERE checkout_id=?",[subscription]))[0].n),1);
    invoice="in_next";until+=30*86400;
    await fulfillCheckout(subscription,user);
    assert.equal(Number((await rows("SELECT COUNT(*) n FROM provider_renewals WHERE checkout_id=?",[subscription]))[0].n),2);
    await cancelUserRenewals(user);assert.equal(cancelled,true);
    const end=(await rows("SELECT ends_at FROM subscriptions WHERE user_id=?",[user]))[0].ends_at;
    invoice="in_stale";until+=30*86400;
    await fulfillCheckout(subscription,user);
    assert.equal((await rows("SELECT ends_at FROM subscriptions WHERE user_id=?",[user]))[0].ends_at,end);
  } finally {
    if(original===undefined) delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=original;
    await write("DELETE FROM provider_renewals WHERE checkout_id=?",[subscription]);
    await write("DELETE FROM provider_checkouts WHERE user_id=?",[user]);
    for(const table of ["financial_events","financial_ledger_entries"]) await write(`DELETE FROM ${table} WHERE request_id=?`,[request]);
    for(const table of ["financial_requests","transactions","accounts","notifications","subscription_events","subscriptions"]) await write(`DELETE FROM ${table} WHERE user_id=?`,[user]);
    await write("DELETE FROM audit_logs WHERE actor_id=?",[user]);
    await write("DELETE FROM users WHERE id=?",[user]);await pool.end();
  }
});
