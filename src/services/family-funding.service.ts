import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, rows, write, type DB } from "@/lib/db";
import { financialIdentity, requireSameEnvironment } from "@/lib/financial-environment";
import { requireCondition } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { walletAmount, validateWalletAmount } from "@/lib/wallet-rules";
import { id } from "@/lib/validation";
import { D } from "@/lib/money";
import { createPaymentDraft, confirmPayment } from "./payment.service";

async function linked(student:string,parent:string,db?:DB) {
  const s=await financialIdentity(student,db),p=await requireSameEnvironment(student,parent,db);
  requireCondition(s.role==="STUDENT"&&p.role==="PARENT","FAMILY_REQUIRED");
  requireCondition((await rows("SELECT id FROM family_links WHERE student_id=? AND parent_id=? AND status='LINKED'",[student,parent],db)).length,"FAMILY_REQUIRED");
  return s;
}
export async function requestFamilyFunding(student:string,input:unknown,key:string) {
  const v=z.object({parent_id:id,amount:walletAmount,currency:z.string().regex(/^[A-Z]{3}$/),reason:z.string().trim().max(500)}).strict().parse(input);
  z.string().min(8).max(100).parse(key);validateWalletAmount(v.amount,v.currency);
  return atomic(async db=>{
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[student],db);
    const s=await linked(student,v.parent_id,db);
    const [old]=await rows("SELECT * FROM family_funding_requests WHERE student_id=? AND idempotency_key=?",[student,key],db);
    if(old) {requireCondition(old.parent_id===v.parent_id&&D(String(old.amount)).eq(v.amount)&&old.currency===v.currency&&old.reason===v.reason,"IDEMPOTENCY_MISMATCH");return {id:String(old.id)};}
    requireCondition((await rows("SELECT id FROM accounts WHERE user_id=? AND currency=? AND archived=0 AND type<>'CASH'",[student,v.currency],db)).length,"RECIPIENT_UNAVAILABLE");
    const [count]=await rows<{n:number}>("SELECT COUNT(*) n FROM family_funding_requests WHERE student_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)",[student],db);
    requireCondition(count.n<10,"RATE_LIMITED");
    const requestId=randomUUID();
    await write("INSERT INTO family_funding_requests(id,student_id,parent_id,environment,amount,currency,reason,idempotency_key,expires_at) VALUES (?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))",[requestId,student,v.parent_id,s.environment,v.amount,v.currency,v.reason,key],db);
    await notify(v.parent_id,"FAMILY_FUNDING_REQUEST",requestId,db);
    await audit(student,"FAMILY_FUNDING_REQUEST","family_funding_requests",requestId,{},db);
    return {id:requestId};
  });
}
export async function decideFamilyFunding(actor:string,requestId:string,decision:string,accountId="") {
  id.parse(requestId);z.enum(["APPROVE","DECLINE","CANCEL","SEND"]).parse(decision);
  return atomic(async db=>{
    const [preview]=await rows<{student_id:string;parent_id:string}>("SELECT student_id,parent_id FROM family_funding_requests WHERE id=?",[requestId],db);
    requireCondition(preview,"NOT_FOUND");
    for(const user of [preview.student_id,preview.parent_id].sort()) await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[user],db);
    const [r]=await rows<{id:string;student_id:string;parent_id:string;status:string;amount:string;currency:string;payment_id:string|null;expired:number}>("SELECT *,expires_at<=UTC_TIMESTAMP() expired FROM family_funding_requests WHERE id=? FOR UPDATE",[requestId],db);
    requireCondition(r,"NOT_FOUND");
    requireCondition(decision==="CANCEL"?actor===r.student_id:actor===r.parent_id);
    if(r.status==="PAID") return {status:r.status,payment_id:r.payment_id};
    requireCondition(!["DECLINED","CANCELLED","EXPIRED"].includes(r.status),"INVALID_STATE");
    if(r.expired) {await write("UPDATE family_funding_requests SET status='EXPIRED' WHERE id=?",[requestId],db);return {status:"EXPIRED",payment_id:null};}
    await linked(r.student_id,r.parent_id,db);
    const status=decision==="DECLINE"?"DECLINED":decision==="CANCEL"?"CANCELLED":"APPROVED_AWAITING_FUNDS";
    // Once a bound payment exists, never permit cancellation or replacement of
    // the funding request while its transfer is in flight.
    requireCondition(!r.payment_id||decision==="SEND","INVALID_STATE");
    if(decision==="SEND") {
      requireCondition(r.status==="APPROVED_AWAITING_FUNDS","APPROVAL_REQUIRED");
      const [wallet]=await rows<{balance:string}>("SELECT balance FROM accounts WHERE id=? AND user_id=? AND currency=? AND archived=0 AND type<>'CASH'",[accountId,actor,r.currency],db);
      requireCondition(wallet,"NOT_FOUND");
      if(D(wallet.balance).lt(r.amount)) return {status:"APPROVED_AWAITING_FUNDS",payment_id:null,shortfall:D(r.amount).minus(wallet.balance).toFixed(2),account_id:accountId};
    }
    if(decision==="SEND") {
      const [recipient]=await rows<{email:string;name:string}>("SELECT email,name FROM users WHERE id=?",[r.student_id],db);
      const draft=await createPaymentDraft(actor,{kind:"SEND",method:"INTERNAL",account_id:accountId,amount:r.amount,recipient:recipient.name,destination:recipient.email,beneficiary_id:null,receive_currency:r.currency,category:"Education",note:"Family support"},`family:${requestId}`,db);
      const sent=await confirmPayment(actor,draft.id,{},"",db);
      requireCondition(sent.status==="COMPLETED","INVALID_STATE");
      await write("UPDATE family_funding_requests SET status='PAID',payment_id=? WHERE id=?",[draft.id,requestId],db);
      await notify(r.student_id,"FAMILY_FUNDING_PAID",requestId,db);
      return {id:requestId,status:"PAID",payment_id:draft.id};
    }
    await write("UPDATE family_funding_requests SET status=? WHERE id=?",[status,requestId],db);
    await audit(actor,`FAMILY_FUNDING_${decision}`,"family_funding_requests",requestId,{},db);
    await notify(r.student_id,"FAMILY_FUNDING_STATUS",`${requestId.slice(0,8)} · ${status}`,db);
    return {...r,status,account_id:accountId};
  });
}
