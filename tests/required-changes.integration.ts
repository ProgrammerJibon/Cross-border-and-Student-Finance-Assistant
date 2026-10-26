import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { rows,write,atomic,pool } from "../src/lib/db";
import { financeRecordsSource } from "../src/lib/finance-records";
import { recordBudgetEntry } from "../src/services/budget-records.service";
import { prepareGatewayTopup } from "../src/services/gateway-topup.service";
import { getTopupQuote,initiateTopup } from "../src/services/topup-checkout.service";
import { fulfillCheckout } from "../src/services/billing.service";
import { POST as stripeWebhook } from "../src/app/api/billing/stripe/route";
import { POST as paypalWebhook } from "../src/app/api/billing/paypal/route";

test("budget isolation and full provider protocol with controlled provider responses",async t=>{
  assert.match(process.env.DB_NAME||"",/^finbridge_test_/);
  const demo=`req-${randomUUID()}`,live=`req-${randomUUID()}`;
  const balance=async(user:string)=>(await rows("SELECT balance FROM accounts WHERE user_id=?",[user]))[0].balance;
  try {
    for(const [user,isDemo] of [[demo,1],[live,0]] as const) {
      await write("INSERT INTO users(id,name,email,password_hash,role,is_demo,onboarded) VALUES (?,?,?,'unused','STUDENT',?,1)",[user,user,`${user}@example.test`,isDemo]);
      await write("INSERT INTO user_preferences(user_id) VALUES (?)",[user]);
      await write("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),user]);
      await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Fixture','WALLET','USD',0)",[user,user]);
    }
    await t.test("income, expenses exceeding wallet funds and analytics preserve Live and Demo balances",async()=>{
      for(const user of [demo,live]) {
        for(const type of ["INCOME","EXPENSE"]) await atomic(db=>recordBudgetEntry(user,{account_id:user,description:"Budget observation",amount:"100",category:"Other",type,date:"2026-10-25",notes:""},db));
        assert.equal(await balance(user),"0.00");
        assert.equal(Number((await rows("SELECT COUNT(*) n FROM transactions WHERE user_id=?",[user]))[0].n),0);
        assert.equal(Number((await rows(`SELECT COUNT(*) n FROM ${financeRecordsSource} WHERE user_id=? AND record_source='BUDGET'`,[user]))[0].n),2);
      }
      await assert.rejects(atomic(db=>recordBudgetEntry(live,{account_id:demo,description:"Forged",amount:"1",category:"Other",type:"INCOME",date:"2026-10-25"},db)),/NOT_FOUND/);
    });
    await t.test("unconfigured and Live gateways cannot create funding orders",async()=>{
      await assert.rejects(prepareGatewayTopup(demo,{id:randomUUID(),account_id:demo,amount:"10",provider:"STRIPE"}),/CHECKOUT_NOT_CONFIGURED/);
      await assert.rejects(prepareGatewayTopup(live,{id:randomUUID(),account_id:live,amount:"10",provider:"PAYPAL"}),/LIVE_RAIL_UNAVAILABLE/);
    });
    Object.assign(process.env,{STRIPE_SECRET_KEY:"sk_test_fixture",STRIPE_WEBHOOK_SECRET:"whsec_fixture",PAYPAL_CLIENT_ID:"fixture",PAYPAL_CLIENT_SECRET:"fixture",PAYPAL_WEBHOOK_ID:"fixture"});
    for(const provider of ["STRIPE","PAYPAL"] as const) await t.test(`${provider}: initiation, failed/unpaid verification, authenticated callbacks and duplicate events`,async st=>{
      const draft=await prepareGatewayTopup(demo,{id:randomUUID(),account_id:demo,amount:"10",provider});
      const quote=await getTopupQuote(demo,{requestId:draft.id});
      assert.equal(quote.amount,"10.00");
      let checkoutId="",remote="",paid=false,networkFailure=true,signatureValid=true;
      const fake=st.mock.method(globalThis,"fetch",async(url: string | URL | Request,init?:RequestInit)=>{
        const target=String(url);
        assert.ok(!target.includes("api-m.paypal.com"));
        if(networkFailure)return new Response("secret-provider-payload",{status:503});
        if(target.endsWith("/v1/oauth2/token"))return Response.json({access_token:"fixture"});
        if(target.includes("verify-webhook-signature"))return Response.json({verification_status:signatureValid?"SUCCESS":"FAILURE"});
        if(target.endsWith("/checkout/sessions")&&init?.method==="POST") {
          const body=new URLSearchParams(String(init.body));checkoutId=body.get("client_reference_id")!;remote=`cs_${checkoutId}`;
          assert.equal(body.get("line_items[0][price_data][unit_amount]"),"1000");
          assert.match(body.get("cancel_url")!,/cancelled=1/);
          return Response.json({id:remote,url:`https://checkout.stripe.com/${remote}`,livemode:false});
        }
        if(target.endsWith("/v2/checkout/orders")&&init?.method==="POST") {
          const body=JSON.parse(String(init.body));checkoutId=body.purchase_units[0].custom_id;remote=`pp_${checkoutId}`;
          assert.equal(body.purchase_units[0].amount.value,"10.00");
          return Response.json({id:remote,links:[{rel:"payer-action",href:`https://www.sandbox.paypal.com/checkoutnow?token=${remote}`}]});
        }
        if(provider==="STRIPE")return Response.json({id:remote,livemode:false,status:paid?"complete":"open",payment_status:paid?"paid":"unpaid",amount_total:1000,currency:"usd",client_reference_id:checkoutId,metadata:{checkout_id:checkoutId},payment_intent:paid?`pi_${checkoutId}`:null});
        return Response.json({id:remote,status:paid?"COMPLETED":"CREATED",purchase_units:[{custom_id:checkoutId,amount:{currency_code:"USD",value:"10.00"},...(paid?{payments:{captures:[{id:`cap_${checkoutId}`,status:"COMPLETED",amount:{currency_code:"USD",value:"10.00"}}]}}:{})}]});
      });
      const input={requestId:draft.id,amount:quote.amount,currency:"USD",locale:"en"};
      await assert.rejects(initiateTopup(demo,{...input,amount:"1.00"}),/CHECKOUT_PRICE_CHANGED/);
      await assert.rejects(initiateTopup(demo,input),/CHECKOUT_PROVIDER_ERROR/);
      networkFailure=false;
      const started=await initiateTopup(demo,input);
      assert.equal((await initiateTopup(demo,input)).id,started.id);
      const before=await balance(demo);
      await assert.rejects(fulfillCheckout(started.id,live),/NOT_FOUND/);
      await assert.rejects(fulfillCheckout(started.id,demo),/CHECKOUT_PENDING/);
      assert.equal(await balance(demo),before);
      const eventId=randomUUID();
      const event=provider==="STRIPE"?{id:eventId,type:"checkout.session.completed",livemode:false,data:{object:{id:remote}}}:{id:eventId,event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{supplementary_data:{related_ids:{order_id:remote}}}};
      const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
      const signature=createHmac("sha256","whsec_fixture").update(`${timestamp}.${body}`).digest("hex");
      const webhook=async(valid=true)=>{
        signatureValid=valid;
        const req=new Request(`http://localhost/api/billing/${provider.toLowerCase()}?environment=sandbox`,{method:"POST",body,headers:{"stripe-signature":`t=${timestamp},v1=${valid?signature:"0".repeat(64)}`}});
        return provider==="STRIPE"?stripeWebhook(req):paypalWebhook(req);
      };
      assert.equal((await webhook(false)).status,400);
      assert.equal(await balance(demo),before);
      paid=true;
      assert.equal((await webhook()).status,200);
      assert.equal((await webhook()).status,200);
      const duplicateEvent={...event,id:randomUUID()},duplicateBody=JSON.stringify(duplicateEvent);
      const duplicateSig=createHmac("sha256","whsec_fixture").update(`${timestamp}.${duplicateBody}`).digest("hex");
      const duplicateRequest=new Request(`http://localhost/api/billing/${provider.toLowerCase()}?environment=sandbox`,{method:"POST",body:duplicateBody,headers:{"stripe-signature":`t=${timestamp},v1=${duplicateSig}`}});
      assert.equal((await (provider==="STRIPE"?stripeWebhook(duplicateRequest):paypalWebhook(duplicateRequest))).status,200);
      await Promise.all([fulfillCheckout(started.id,demo),fulfillCheckout(started.id,demo)]);
      assert.equal(Number(await balance(demo)),Number(before)+10);
      assert.equal(Number((await rows("SELECT COUNT(*) n FROM financial_ledger_entries WHERE request_id=?",[draft.id]))[0].n),2);
      assert.equal((await rows("SELECT receipt FROM provider_checkouts WHERE id=?",[started.id]))[0].receipt,`${provider==="STRIPE"?"pi":"cap"}_${started.id}`);
      for(const terminal of provider==="STRIPE"?["checkout.session.async_payment_failed","checkout.session.expired"]:["PAYMENT.CAPTURE.DENIED"]) {
        paid=false;
        const pending=await prepareGatewayTopup(demo,{id:randomUUID(),account_id:demo,amount:"10",provider});
        const pendingQuote=await getTopupQuote(demo,{requestId:pending.id});
        const pendingCheckout=await initiateTopup(demo,{requestId:pending.id,amount:pendingQuote.amount,currency:"USD",locale:"en"});
        const failure=provider==="STRIPE"?{id:randomUUID(),type:terminal,livemode:false,data:{object:{id:remote}}}:{id:randomUUID(),event_type:terminal,resource:{supplementary_data:{related_ids:{order_id:remote}}}};
        const payload=JSON.stringify(failure),sig=createHmac("sha256","whsec_fixture").update(`${timestamp}.${payload}`).digest("hex");
        const req=new Request(`http://localhost/api/billing/${provider.toLowerCase()}?environment=sandbox`,{method:"POST",body:payload,headers:{"stripe-signature":`t=${timestamp},v1=${sig}`}});
        assert.equal((await (provider==="STRIPE"?stripeWebhook(req):paypalWebhook(req))).status,200);
        const [state]=await rows("SELECT status,receipt FROM provider_checkouts WHERE id=?",[pendingCheckout.id]);
        assert.equal(state.status,terminal.endsWith("expired")?"CANCELLED":"FAILED");assert.equal(state.receipt,null);
        await assert.rejects(fulfillCheckout(pendingCheckout.id,demo),/INVALID_STATE/);
        assert.equal(Number(await balance(demo)),Number(before)+10);
      }
      fake.mock.restore();
    });
  } finally { await pool.end(); }
});
