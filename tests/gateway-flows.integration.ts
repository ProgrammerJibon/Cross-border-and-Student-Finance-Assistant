import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rows, write, pool } from "../src/lib/db";
import { prepareGatewayTopup } from "../src/services/gateway-topup.service";
import { getTopupQuote, initiateTopup } from "../src/services/topup-checkout.service";
import { fulfillCheckout } from "../src/services/billing.service";
import { checkoutEnvironment } from "../src/lib/financial-environment";
import { requirePlanPurchase } from "../src/lib/entitlements";
import { confirmPayment } from "../src/services/payment.service";

test("both hosted gateways require verified payment before crediting a wallet", async t => {
  assert.match(process.env.DB_NAME || "", /^finbridge_test_/);
  const user = `gw-${randomUUID()}`, live = `gw-${randomUUID()}`, wallet = randomUUID();
  const keys = { STRIPE_SECRET_KEY:"sk_test_fixture", STRIPE_WEBHOOK_SECRET:"whsec_fixture", PAYPAL_CLIENT_ID:"fixture", PAYPAL_CLIENT_SECRET:"fixture", PAYPAL_WEBHOOK_ID:"fixture", PAYMENT_CONFIG_SOURCE:"environment" };
  const previous = Object.fromEntries(Object.keys(keys).map(key => [key,process.env[key]]));
  Object.assign(process.env, keys);
  try {
    for (const [id,demo] of [[user,1],[live,0]] as const) {
      await write("INSERT INTO users(id,name,email,password_hash,role,is_demo) VALUES (?,'Gateway regression',?,'unused','STUDENT',?)",[id,`${id}@example.test`,demo]);
      await write("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student-free',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id]);
    }
    await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Gateway wallet','WALLET','CNY',0)",[wallet,user]);
    assert.equal(await checkoutEnvironment(user), "sandbox");
    assert.equal(await checkoutEnvironment(live), "live");
    await assert.rejects(checkoutEnvironment(user,"live"), /ENVIRONMENT_MISMATCH/);
    await assert.rejects(checkoutEnvironment(live,"sandbox"), /ENVIRONMENT_MISMATCH/);
    await requirePlanPurchase(user,"student",undefined,true);
    await assert.rejects(requirePlanPurchase(user,"family",undefined,true), /PLAN_NOT_ALLOWED/);
    let balance = 0;
    for (const provider of ["STRIPE","PAYPAL"] as const) {
      await t.test(provider, async st => {
        let paid = false, failCreation = true, checkoutId = "", charge = "", requests = 0;
        const remote = `${provider}-${randomUUID()}`;
        st.mock.method(globalThis,"fetch",async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if(url.endsWith("/v1/oauth2/token")) return Response.json({access_token:"fixture-token"});
          if(init?.method === "POST" && (url.endsWith("/checkout/sessions") || url.endsWith("/v2/checkout/orders"))) {
            requests++;
            if (failCreation) return new Response("",{status:503});
            if(provider === "STRIPE") {
              const body = new URLSearchParams(String(init.body));
              checkoutId = body.get("client_reference_id")!;
              charge = (Number(body.get("line_items[0][price_data][unit_amount]"))/100).toFixed(2);
              assert.equal(body.get("mode"),"payment");
              return Response.json({id:remote,livemode:false,url:`https://checkout.stripe.com/c/pay/${remote}`});
            }
            assert.match(url,/api-m\.sandbox\.paypal\.com/);
            const body = JSON.parse(String(init.body));
            checkoutId = body.purchase_units[0].custom_id;
            charge = body.purchase_units[0].amount.value;
            return Response.json({id:remote,links:[{rel:"approve",href:`https://www.sandbox.paypal.com/checkoutnow?token=${remote}`}]});
          }
          if(provider === "STRIPE") return Response.json({id:remote,livemode:false,status:paid?"complete":"open",payment_status:paid?"paid":"unpaid",amount_total:Number(charge)*100,currency:"usd",client_reference_id:checkoutId,metadata:{checkout_id:checkoutId},payment_intent:paid?`pi-${remote}`:null});
          return Response.json({id:remote,status:paid?"COMPLETED":"CREATED",purchase_units:[{custom_id:checkoutId,amount:{currency_code:"USD",value:charge},...(paid?{payments:{captures:[{id:`capture-${remote}`,status:"COMPLETED",amount:{currency_code:"USD",value:charge}}]}}:{})}]});
        });
        const id = randomUUID();
        const draft = await prepareGatewayTopup(user,{id,account_id:wallet,amount:"20",provider});
        assert.equal((await prepareGatewayTopup(user,{id,account_id:wallet,amount:"20",provider})).id,draft.id);
        await assert.rejects(confirmPayment(user,draft.id,{},"fake receipt"), /USE_PROVIDER_CHECKOUT/);
        const quote = await getTopupQuote(user,{requestId:draft.id});
        assert.equal(quote.environment,"sandbox");
        const input = {requestId:draft.id,amount:quote.amount,currency:"USD",locale:"en"};
        await assert.rejects(initiateTopup(user,{...input,amount:"999.99"}), /CHECKOUT_PRICE_CHANGED/);
        await assert.rejects(initiateTopup(user,input), /CHECKOUT_PROVIDER_ERROR/);
        assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet]))[0].balance),balance);
        failCreation = false;
        const checkout = await initiateTopup(user,input);
        assert.match(checkout.url,provider === "STRIPE" ? /^https:\/\/checkout\.stripe\.com/ : /^https:\/\/www\.sandbox\.paypal\.com/);
        assert.equal((await initiateTopup(user,input)).id,checkout.id);
        assert.equal(requests,2);
        await assert.rejects(fulfillCheckout(checkout.id,live), /NOT_FOUND/);
        await assert.rejects(fulfillCheckout(checkout.id,user), /CHECKOUT_PENDING/);
        assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet]))[0].balance),balance);
        paid = true;
        await Promise.all([fulfillCheckout(checkout.id,user),fulfillCheckout(checkout.id,user)]);
        await fulfillCheckout(checkout.id,user);
        balance += 20;
        assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet]))[0].balance),balance);
        assert.equal(Number((await rows("SELECT COUNT(*) n FROM provider_topup_receipts WHERE checkout_id=?",[checkout.id]))[0].n),1);
      });
    }
    await assert.rejects(prepareGatewayTopup(live,{id:randomUUID(),account_id:wallet,amount:"20",provider:"STRIPE"}), /LIVE_RAIL_UNAVAILABLE/);
  } finally {
    for(const [key,value] of Object.entries(previous)) {if(value===undefined) delete process.env[key];else process.env[key]=value;}
    await write("DELETE FROM provider_topup_receipts WHERE checkout_id IN (SELECT id FROM provider_checkouts WHERE user_id=?)",[user]);
    await write("DELETE FROM provider_checkouts WHERE user_id=?",[user]);
    for(const table of ["financial_events","financial_ledger_entries","financial_approvals"]) await write(`DELETE FROM ${table} WHERE request_id IN (SELECT id FROM financial_requests WHERE user_id=?)`,[user]);
    for(const table of ["financial_requests","transactions","notifications","accounts"]) await write(`DELETE FROM ${table} WHERE user_id=?`,[user]);
    for(const id of [user,live]) {
      await write("DELETE FROM audit_logs WHERE actor_id=?",[id]);
      await write("DELETE FROM subscriptions WHERE user_id=?",[id]);
      await write("DELETE FROM users WHERE id=?",[id]);
    }
    await pool.end();
  }
});
