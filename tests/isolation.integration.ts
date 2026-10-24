import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rows, write, pool } from "../src/lib/db";
import { checkoutEnvironment, requireDemoFinance } from "../src/lib/financial-environment";
import { createPaymentDraft, confirmPayment, settlePayment, createBeneficiary, paymentWorkspace } from "../src/services/payment.service";
import { fundingAssistance } from "../src/services/funding-assistance.service";
import { processWebhook, recordProviderException } from "../src/services/webhook-events.service";
import { fulfillCheckout } from "../src/services/billing.service";
import { execute } from "../src/services/sandbox-payment.service";

test("financial environments fail closed across services, database, funding and webhooks", async t => {
  assert.match(process.env.DB_NAME || "", /^finbridge_test_/);
  const prefix=`iso-${randomUUID().slice(0,8)}`;
  const demo=`${prefix}-d`, live=`${prefix}-l`, friend=`${prefix}-f`, admin=`${prefix}-a`, liveAdmin=`${prefix}-la`;
  const users=[demo,live,friend,admin,liveAdmin];
  const wallet=(id:string)=>`${id}-wallet`;
  const input=(user:string, destination:string, amount="10")=>({kind:"SEND",method:"INTERNAL",account_id:wallet(user),amount,recipient:"Recipient",destination:`${destination}@example.test`,beneficiary_id:null,receive_currency:"USD",category:"Other",note:"Isolation fixture"});
  try {
    for(const user of users) {
      await write("INSERT INTO users(id,name,email,password_hash,role,is_demo) VALUES (?,?,?,'unused',?,?)",[user,user,`${user}@example.test`,[admin,liveAdmin].includes(user)?"ADMIN":"STUDENT",![live,liveAdmin].includes(user)]);
      await write("INSERT INTO user_preferences(user_id) VALUES (?)",[user]);
      await write("INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,'student','ACTIVE',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),user]);
      await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Fixture','WALLET','USD',?)",[wallet(user),user,user===demo?"20":"0"]);
    }
    await t.test("Live balances start at zero and cannot be manually minted or reclassified", async()=>{
      assert.equal((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(live)]))[0].balance,"0.00");
      await assert.rejects(write("UPDATE accounts SET balance=1 WHERE id=?",[wallet(live)]),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(write("UPDATE users SET is_demo=1 WHERE id=?",[live]),/ENVIRONMENT_IMMUTABLE/);
      await assert.rejects(write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Invalid','WALLET','USD',1)",[randomUUID(),live]),/LIVE_OPENING_BALANCE_ZERO/);
      const [legacy]=await rows("SELECT balance,legacy_unverified_balance FROM accounts WHERE id='legacy-wallet'");
      assert.equal(legacy.balance,"0.00");assert.equal(legacy.legacy_unverified_balance,"125.00");
    });
    await t.test("both directions reject cross-environment recipients and beneficiaries", async()=>{
      for(const [from,to] of [[demo,live],[live,demo]]) {
        await assert.rejects(createPaymentDraft(from,input(from,to),randomUUID()),/RECIPIENT_UNAVAILABLE/);
        await assert.rejects(createBeneficiary(from,{name:"Recipient",method:"INTERNAL",currency:"USD",country_code:"US",destination:`${to}@example.test`}),/RECIPIENT_UNAVAILABLE/);
      }
      for(const [student,parent] of [[demo,live],[live,demo]]) await assert.rejects(write("INSERT INTO family_links(id,student_id,parent_id,status,visibility) VALUES (?,?,?,'LINKED','{}')",[randomUUID(),student,parent]),/ENVIRONMENT_MISMATCH/);
    });
    await t.test("Live sandbox execution, manual bank funding and arbitrary balances are blocked", async()=>{
      await assert.rejects(requireDemoFinance(live),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(execute(live,"missing","x".repeat(64)),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(createPaymentDraft(live,{...input(live,live),kind:"TOPUP",method:"BANK",destination:"",recipient:""},randomUUID()),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(checkoutEnvironment(live,"sandbox"),/ENVIRONMENT_MISMATCH/);
      await assert.rejects(checkoutEnvironment(demo,"live"),/ENVIRONMENT_MISMATCH/);
      await assert.rejects(write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment) VALUES (?,?,'student','monthly','STRIPE',1,'USD','sandbox')",[randomUUID(),live]),/ENVIRONMENT_MISMATCH/);
      await assert.rejects(write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,purpose) VALUES (?,?,'student','once','STRIPE',1,'USD','live','TOPUP')",[randomUUID(),live]),/LIVE_RAIL_UNAVAILABLE/);
    });
    await t.test("database ownership checks reject another user's account", async()=>{
      await assert.rejects(write("INSERT INTO financial_requests(id,user_id,account_id,kind,method,amount,currency,recipient,destination,receive_amount,receive_currency,fx_rate,idempotency_key) VALUES (?,?,?,'TOPUP','BANK',1,'USD','','',1,'USD',1,?)",[randomUUID(),demo,wallet(live),randomUUID()]),/ACCOUNT_OWNERSHIP_MISMATCH/);
    });
    await t.test("underfunded drafts survive failed funding and require confirmation after funding", async()=>{
      const draft=await createPaymentDraft(demo,input(demo,friend,"25"),randomUUID());
      await assert.rejects(confirmPayment(demo,draft.id),/INSUFFICIENT_BALANCE/);
      const help=await fundingAssistance(demo,draft.id);
      assert.equal(help.shortfall,"5.00");assert.equal(help.available,"20.00");assert.equal(help.confirmationRequired,true);
      await assert.rejects(fundingAssistance(live,draft.id),/NOT_FOUND/);
      const topup=await createPaymentDraft(demo,{...input(demo,friend,"5"),kind:"TOPUP",method:"CARD"},randomUUID());
      await confirmPayment(demo,topup.id,{cardholder:"Fixture",card:"4000000000000002",cvv:"123",expiry:"12/39"});
      assert.equal((await fundingAssistance(demo,draft.id)).shortfall,"5.00");
      const good=await createPaymentDraft(demo,{...input(demo,friend,"5"),kind:"TOPUP",method:"CARD"},randomUUID());
      await confirmPayment(demo,good.id,{cardholder:"Fixture",card:"4242424242424242",cvv:"123",expiry:"12/39"});
      assert.equal((await fundingAssistance(demo,draft.id)).shortfall,"0.00");
      assert.equal((await rows("SELECT status FROM financial_requests WHERE id=?",[draft.id]))[0].status,"DRAFT");
      const result=await Promise.all([confirmPayment(demo,draft.id),confirmPayment(demo,draft.id)]);
      assert.ok(result.every(r=>r.status==="COMPLETED"));
      assert.equal((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(friend)]))[0].balance,"25.00");
      await assert.rejects(write("UPDATE financial_ledger_entries SET amount=2 WHERE request_id=?",[draft.id]),/FINANCIAL_HISTORY_IMMUTABLE/);
    });
    await t.test("admin financial views are environment scoped",async()=>{
      assert.ok((await paymentWorkspace(admin)).requests.every(r=>r.user_id!==live && r.financial_environment==="DEMO"));
      assert.ok((await paymentWorkspace(liveAdmin)).requests.every(r=>r.user_id!==demo));
      const [legacy]=await rows("SELECT id FROM financial_requests WHERE id='legacy-request'");
      if(legacy) {
        await assert.rejects(settlePayment(admin,"legacy-request","COMPLETED","fixture","reference"),/ENVIRONMENT_MISMATCH/);
        await assert.rejects(settlePayment(liveAdmin,"legacy-request","COMPLETED","fixture","reference"),/LIVE_RAIL_UNAVAILABLE/);
      }
    });
    await t.test("webhook replay is deduplicated and failed processing can recover",async()=>{
      let count=0;
      const event=`${prefix}-webhook`;
      const run=()=>processWebhook("STRIPE","sandbox",event,"fixture","{}",async()=>{count++;});
      await run();await run();assert.equal(count,1);
      await assert.rejects(processWebhook("STRIPE","sandbox",event,"fixture","{\"changed\":true}",async()=>{count++;}),/WEBHOOK_REPLAY_MISMATCH/);
      const retry=`${prefix}-retry`;
      await assert.rejects(processWebhook("STRIPE","sandbox",retry,"fixture","{}",async()=>{throw Error("network");}),/network/);
      await processWebhook("STRIPE","sandbox",retry,"fixture","{}",async()=>{count++;});assert.equal(count,2);
      await recordProviderException("STRIPE","sandbox",event,"charge.refunded");
      await recordProviderException("STRIPE","sandbox",event,"charge.refunded");
      assert.equal((await rows("SELECT * FROM financial_reconciliation_issues WHERE external_id=?",[event])).length,1);
    });
    await t.test("missing credentials cannot complete a checkout or credit a wallet",async()=>{
      const id=randomUUID();
      await write("INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,remote_id) VALUES (?,?,'student','monthly','STRIPE',1,'USD','sandbox',?)",[id,demo,`cs_${id}`]);
      await assert.rejects(fulfillCheckout(id,demo),/CHECKOUT_NOT_CONFIGURED/);
      assert.equal((await rows("SELECT status FROM provider_checkouts WHERE id=?",[id]))[0].status,"CREATED");
    });
  } finally {
    for(const user of users) {
      await write("DELETE FROM provider_checkouts WHERE user_id=?",[user]);
      for(const table of ["financial_events","financial_ledger_entries","financial_approvals"]) await write(`DELETE FROM ${table} WHERE request_id IN (SELECT id FROM financial_requests WHERE user_id=?)`,[user]);
      for(const table of ["financial_requests","transactions","beneficiaries","saved_cards","accounts","subscriptions","user_preferences","notifications","usage_counters","risk_assessments"]) await write(`DELETE FROM ${table} WHERE user_id=?`,[user]);
      await write("DELETE FROM audit_logs WHERE actor_id=?",[user]);await write("DELETE FROM users WHERE id=?",[user]);
    }
    await write("DELETE FROM provider_webhook_events WHERE event_id LIKE ?",[`${prefix}%`]);
    await write("DELETE FROM financial_reconciliation_issues WHERE external_id LIKE ?",[`${prefix}%`]);
    await pool.end();
  }
});
