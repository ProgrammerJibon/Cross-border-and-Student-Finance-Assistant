import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {rows,write,pool} from "../src/lib/db";
import {createBeneficiary,createPaymentDraft,confirmPayment} from "../src/services/payment.service";
import {submitWalletOperation,reviewWalletOperation,walletWorkspace,discoverRecipients,saveReceivingAccount} from "../src/services/wallet-workflows.service";
import {eligibleRecipients} from "../src/services/recipient.service";
import {requestFamilyFunding,decideFamilyFunding} from "../src/services/family-funding.service";

test("isolated wallet and family workflows",async t=>{
  assert.match(process.env.DB_NAME||"",/^finbridge_test_/);
  const prefix=`wf-${randomUUID().slice(0,8)}`;
  const s=`${prefix}-s`,p=`${prefix}-p`,s2=`${prefix}-s2`,p2=`${prefix}-p2`,admin=`${prefix}-admin`,admin2=`${prefix}-admin2`,live=`${prefix}-live`,la=`${prefix}-la`;
  const wallet=(u:string)=>`${u}-wallet`;
  for(const [user,role,demo] of [[s,"STUDENT",1],[p,"PARENT",1],[s2,"STUDENT",1],[p2,"PARENT",1],[admin,"ADMIN",1],[admin2,"ADMIN",1],[live,"STUDENT",0],[la,"ADMIN",0]] as const){
    await write("INSERT INTO users(id,name,email,password_hash,role,is_demo,discoverable,mfa_enabled) VALUES (?,?,?,'unused',?,?,1,?)",[user,`Wallet ${user}`,`${user}@example.test`,role,demo,user===la]);
    await write("INSERT INTO user_preferences(user_id) VALUES (?)",[user]);
    await write("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'family',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),user]);
    await write("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Wallet','WALLET','CNY',?)",[wallet(user),user,demo?"1000":"0"]);
  }
  const input=(u:string,kind="FUNDING_GATEWAY",extra:Record<string,string>={})=>({account_id:wallet(u),amount:"10",kind,method:"STRIPE",holder:"Fixture user",identifier:"",reference:"",receiving_account_id:"",...extra});
  const link=async(student:string,parent:string)=>{const id=randomUUID();await write("INSERT INTO family_links(id,student_id,parent_id,status,visibility) VALUES (?,?,?,'LINKED','{}')",[id,student,parent]);await write("INSERT INTO parental_controls(link_id,auto_approve,threshold) VALUES (?,1,10000)",[id]);return id;};
  const send=async(from:string,to:string,b:string|null=null,amount="5",key=randomUUID())=>createPaymentDraft(from,{kind:"SEND",method:"INTERNAL",account_id:wallet(from),amount,recipient:"Recipient",destination:`${to}@example.test`,beneficiary_id:b,receive_currency:"CNY",category:"Other",note:"Fixture"},key);
  try {
    await t.test("discovery excludes other environment and partial-email enumeration",async()=>{
      assert.equal((await discoverRecipients(s,`${live}@example.test`)).length,0);
      assert.equal((await discoverRecipients(s,`${p}@example.test`)).length,1);
      assert.equal((await discoverRecipients(s,`${p}@`)).length,0);
      assert.ok((await discoverRecipients(s,`Wallet ${prefix}`)).every(r=>r.id!==live&&r.email.includes("***")));
      await write("UPDATE users SET discoverable=0 WHERE id=?",[p2]);
      assert.equal((await discoverRecipients(s,`${p2}@example.test`)).length,0);
      await write("UPDATE users SET discoverable=1 WHERE id=?",[p2]);
    });
    await t.test("name search ranks exact matches and offers bounded non-overlapping pages",async()=>{
      const name=`Search ${prefix}`;
      for(let i=0;i<12;i++)await write("INSERT INTO users(id,name,email,password_hash,role,is_demo,discoverable) VALUES (?,?,?,'unused','STUDENT',1,1)",[`${prefix}-search-${i}`,i===11?name:`${name} ${i}`,`${prefix}-search-${i}@example.test`]);
      const first=await discoverRecipients(s,name),second=await discoverRecipients(s,name,1);
      assert.equal(first.length,10);assert.equal(second.length,2);assert.equal(first[0].name,name);
      assert.equal(new Set([...first,...second].map(r=>r.id)).size,12);
      await assert.rejects(discoverRecipients(s,name,5));
      await assert.rejects(discoverRecipients(s,name,-1));
    });
    await t.test("every non-family transfer requires approved beneficiary, including tiny amounts",async()=>{
      await assert.rejects(send(s,s2,null,"0.01"),/BENEFICIARY_REQUIRED/);
      await assert.rejects(send(p,p2),/BENEFICIARY_REQUIRED/);
      await assert.rejects(send(s,live),/RECIPIENT_UNAVAILABLE/);
      await assert.rejects(send(live,s),/RECIPIENT_UNAVAILABLE/);
    });
    const firstLink=await link(s,p);await link(s2,p);
    await t.test("accepted family supports parent to student, student to parent and siblings",async()=>{
      assert.equal((await eligibleRecipients(s)).length,2);
      for(const [from,to] of [[p,s],[s,p],[s,s2]]) assert.equal((await confirmPayment(from,(await send(from,to)).id)).status,"COMPLETED");
    });
    await t.test("unrelated parent to parent uses an approved beneficiary; revocation is immediate",async()=>{
      const b=await createBeneficiary(p,{name:"Other Parent",method:"INTERNAL",currency:"CNY",country_code:"CN",destination:`${p2}@example.test`});
      const draft=await send(p,p2,b.id);assert.equal((await confirmPayment(p,draft.id)).status,"COMPLETED");
      const stale=await send(p,p2,b.id);await write("UPDATE beneficiaries SET status='REMOVED' WHERE id=?",[b.id]);
      await assert.rejects(confirmPayment(p,stale.id),/BENEFICIARY_REQUIRED/);
      const sibling=await send(s,s2);await write("UPDATE family_links SET status='REVOKED' WHERE id=?",[firstLink]);
      await assert.rejects(confirmPayment(s,sibling.id),/BENEFICIARY_REQUIRED/);
      await write("UPDATE family_links SET status='LINKED' WHERE id=?",[firstLink]);
    });
    await t.test("external send is rejected",async()=>{
      await assert.rejects(createPaymentDraft(s,{kind:"SEND",method:"PAYPAL",account_id:wallet(s),amount:"5",recipient:"Outside",destination:"outside@example.test",beneficiary_id:null,receive_currency:"CNY",category:"Other",note:""},randomUUID()),/EXTERNAL_SEND_DISABLED/);
    });
    await t.test("gateway simulation is explicitly Demo-only and credits once",async()=>{
      const key=randomUUID(),op=await submitWalletOperation(s,input(s),key);
      assert.equal((await submitWalletOperation(s,input(s),key)).id,op.id);
      await assert.rejects(submitWalletOperation(s,input(s,"FUNDING_GATEWAY",{amount:"11"}),key),/IDEMPOTENCY_MISMATCH/);
      const before=String((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(s)]))[0].balance);
      const results=await Promise.all([reviewWalletOperation(s,op.id,"SIMULATE_GATEWAY"),reviewWalletOperation(s,op.id,"SIMULATE_GATEWAY")]);
      assert.ok(results.every(r=>r.status==="COMPLETED"));
      assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(s)]))[0].balance),Number(before)+10);
      await assert.rejects(submitWalletOperation(live,input(live),randomUUID()),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(reviewWalletOperation(live,op.id,"SIMULATE_GATEWAY"),/ENVIRONMENT_MISMATCH/);
    });
    await t.test("manual submissions require evidence review and never credit on submission",async()=>{
      const receiving=(await walletWorkspace(s)).receiving.find(r=>r.method==="UNIONPAY")!;assert.ok(receiving);
      const v=input(s,"FUNDING_MANUAL",{method:"UNIONPAY",receiving_account_id:receiving.id,identifier:"DEMO-SENDER",reference:randomUUID()});
      const before=(await rows("SELECT balance FROM accounts WHERE id=?",[wallet(s)]))[0].balance;
      const op=await submitWalletOperation(s,v,randomUUID());assert.equal(op.status,"PENDING_VERIFICATION");
      assert.equal((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(s)]))[0].balance,before);
      await assert.rejects(submitWalletOperation(s,v,randomUUID()),/DUPLICATE_REFERENCE/);
      await assert.rejects(reviewWalletOperation(p,op.id,"PROCESSING"),/FORBIDDEN/);
      await assert.rejects(reviewWalletOperation(la,op.id,"PROCESSING"),/ENVIRONMENT_MISMATCH/);
      await assert.rejects(reviewWalletOperation(admin,op.id,"COMPLETED"),/INVALID_STATE/);
      await reviewWalletOperation(admin,op.id,"PROCESSING");
      await assert.rejects(reviewWalletOperation(admin2,op.id,"EVIDENCE_RECORDED",{reference:"Demo statement fixture",amount:"10",currency:"CNY",settled_at:new Date().toISOString(),payee_verified:true}),/FORBIDDEN/);
      await assert.rejects(reviewWalletOperation(admin,op.id,"EVIDENCE_RECORDED",{reference:"Example",amount:"9",currency:"CNY",settled_at:new Date().toISOString(),payee_verified:true}),/SETTLEMENT_MISMATCH/);
      await reviewWalletOperation(admin,op.id,"EVIDENCE_RECORDED",{reference:"Demo statement fixture",amount:"10",currency:"CNY",settled_at:new Date().toISOString(),payee_verified:true});
      await reviewWalletOperation(admin,op.id,"COMPLETED");await reviewWalletOperation(admin,op.id,"COMPLETED");
      assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(s)]))[0].balance),Number(before)+10);
      assert.equal((await walletWorkspace(live)).receiving.length,0);
    });
    await t.test("withdrawal reserves, cancels and completes exactly once",async()=>{
      const before=Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(p2)]))[0].balance);
      const v=input(p2,"WITHDRAWAL_MANUAL",{method:"PAYPAL",identifier:"payee@example.test"});
      const op=await submitWalletOperation(p2,v,randomUUID());
      assert.equal(op.status,"PENDING_REVIEW");
      const [held]=await rows("SELECT balance,reserved_balance FROM accounts WHERE id=?",[wallet(p2)]);assert.equal(Number(held.balance),before-10);assert.equal(Number(held.reserved_balance),10);
      await reviewWalletOperation(p2,op.id,"CANCELLED");await reviewWalletOperation(p2,op.id,"CANCELLED");
      assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(p2)]))[0].balance),before);
      const paid=await submitWalletOperation(p2,v,randomUUID());await reviewWalletOperation(admin,paid.id,"PROCESSING");
      await reviewWalletOperation(admin,paid.id,"EVIDENCE_RECORDED",{reference:"Demo payout fixture",amount:"10",currency:"CNY",settled_at:new Date().toISOString(),payee_verified:true});
      await reviewWalletOperation(admin,paid.id,"COMPLETED");
      assert.equal(Number((await rows("SELECT reserved_balance FROM accounts WHERE id=?",[wallet(p2)]))[0].reserved_balance),0);
      await assert.rejects(submitWalletOperation(live,input(live,"WITHDRAWAL_MANUAL",{method:"PAYPAL",identifier:"payee@example.test"}),randomUUID()),/LIVE_RAIL_UNAVAILABLE/);
    });
    await t.test("a missing reservation cannot produce a successful cancellation or release journal",async()=>{
      const op=await submitWalletOperation(p2,input(p2,"WITHDRAWAL_MANUAL",{method:"PAYPAL",identifier:"payee@example.test"}),randomUUID());
      await write("UPDATE accounts SET reserved_balance=0 WHERE id=?",[wallet(p2)]);
      await assert.rejects(reviewWalletOperation(p2,op.id,"CANCELLED"),/RESERVATION_MISMATCH/);
      assert.equal((await rows("SELECT status FROM wallet_operations WHERE id=?",[op.id]))[0].status,"PENDING_REVIEW");
      assert.equal((await rows("SELECT id FROM wallet_journal WHERE operation_id=? AND phase='RELEASE'",[op.id])).length,0);
      await write("UPDATE accounts SET reserved_balance=10 WHERE id=?",[wallet(p2)]);
      await reviewWalletOperation(p2,op.id,"CANCELLED");
    });
    await t.test("concurrent withdrawals cannot overdraw",async()=>{
      const amount=String((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(p2)]))[0].balance);
      const v=input(p2,"WITHDRAWAL_MANUAL",{amount,method:"PAYPAL",identifier:"payee@example.test"});
      const r=await Promise.allSettled([submitWalletOperation(p2,v,randomUUID()),submitWalletOperation(p2,v,randomUUID())]);
      assert.equal(r.filter(r=>r.status==="fulfilled").length,1);assert.equal(Number((await rows("SELECT balance FROM accounts WHERE id=?",[wallet(p2)]))[0].balance),0);
    });
    await t.test("student requests require linked parent and approval never means paid",async()=>{
      await assert.rejects(requestFamilyFunding(s,{parent_id:p2,amount:"5",currency:"CNY",reason:"Tuition"},randomUUID()),/FAMILY_REQUIRED/);
      const request=await requestFamilyFunding(s,{parent_id:p,amount:"5",currency:"CNY",reason:"Tuition"},randomUUID());
      await assert.rejects(decideFamilyFunding(p2,request.id,"APPROVE"),/FORBIDDEN/);
      assert.equal((await decideFamilyFunding(p,request.id,"APPROVE")).status,"APPROVED_AWAITING_FUNDS");
      const result=await Promise.all([decideFamilyFunding(p,request.id,"SEND",wallet(p)),decideFamilyFunding(p,request.id,"SEND",wallet(p))]);
      assert.ok(result.every(r=>r.status==="PAID"));
      assert.equal((await rows("SELECT id FROM financial_requests WHERE idempotency_key=?",[`family:${request.id}`])).length,1);
      const declined=await requestFamilyFunding(s,{parent_id:p,amount:"5",currency:"CNY",reason:"Tuition"},randomUUID());
      assert.equal((await decideFamilyFunding(p,declined.id,"DECLINE")).status,"DECLINED");
      await assert.rejects(decideFamilyFunding(p,declined.id,"SEND",wallet(p)),/INVALID_STATE/);
    });
    await t.test("journal is balanced and immutable; receiving records cannot cross environments",async()=>{
      assert.equal((await rows("SELECT operation_id FROM wallet_journal GROUP BY operation_id,phase,currency HAVING SUM(IF(direction='DEBIT',amount,-amount))<>0")).length,0);
      await assert.rejects(write("UPDATE wallet_journal SET amount=1 WHERE operation_id IN (SELECT id FROM wallet_operations WHERE user_id=?)",[s]),/FINANCIAL_HISTORY_IMMUTABLE/);
      await assert.rejects(saveReceivingAccount(la,{method:"ALIPAY",holder:"Live",identifier:"live@example.test",currency:"CNY",instructions:"Trusted account",minimum:"1",maximum:"100",active:true,display_order:0}),/LIVE_RAIL_UNAVAILABLE/);
      await assert.rejects(submitWalletOperation(s,{...input(s),account_id:wallet(live)},randomUUID()),/NOT_FOUND/);
    });
  }finally{await pool.end();}
});
