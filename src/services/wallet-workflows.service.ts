import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { atomic, rows, write, type DB } from "@/lib/db";
import { financialIdentity, requireDemoFinance, requireSameEnvironment } from "@/lib/financial-environment";
import { requireCondition } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { D } from "@/lib/money";
import { hasPermission } from "@/lib/admin-permissions";
import { manualMethods, walletAmount, validateIdentifier, validateWalletAmount, identifierHint } from "@/lib/wallet-rules";
import { eligibleRecipients, discoverRecipients } from "./recipient.service";
import { createBeneficiary, createPaymentDraft, confirmPayment, checkWithdrawalRisk } from "./payment.service";
import { id } from "@/lib/validation";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const inputSchema=z.object({account_id:id,amount:walletAmount,kind:z.enum(["FUNDING_MANUAL","FUNDING_GATEWAY","WITHDRAWAL_MANUAL"]),
  method:z.enum([...manualMethods,"STRIPE"]),receiving_account_id:z.string().max(64).default(""),
  holder:z.string().trim().min(2).max(160),identifier:z.string().trim().max(190),reference:z.string().trim().max(190).default("")}).strict();
type Operation={id:string;user_id:string;account_id:string;environment:string;kind:string;method:string;amount:string;currency:string;status:string;input_hash:string;operator_id:string|null};
type Receiving={id:string;environment:string;method:string;holder:string;identifier_cipher:string;currency:string;instructions:string;minimum:string;maximum:string;active:number;display_order:number};
async function customer(userId:string,db?:DB) {
  const u=await financialIdentity(userId,db);
  requireCondition(["STUDENT","PARENT"].includes(u.role));
  return u;
}
async function operator(userId:string,section:"settlements"|"payment-methods",db?:DB) {
  const u=await financialIdentity(userId,db);
  const [permissions]=await rows<{admin_permissions:string|null}>("SELECT admin_permissions FROM users WHERE id=?",[userId],db);
  requireCondition(hasPermission({...u,...permissions},section));
  return u;
}
export async function validateFundingDraft(userId:string,input:unknown) {
  const v=z.object({account_id:id,amount:walletAmount}).strict().parse(input);
  const user=await customer(userId);
  const [wallet]=await rows<{id:string;currency:string;balance:string}>("SELECT id,currency,balance FROM accounts WHERE id=? AND user_id=? AND type<>'CASH' AND archived=0 AND financial_environment=?",[v.account_id,userId,user.environment]);
  requireCondition(wallet,"NOT_FOUND");validateWalletAmount(v.amount,wallet.currency);
  return {wallet,amount:D(v.amount).toFixed(2),fee:"0.00",net:D(v.amount).toFixed(2),environment:user.environment};
}
async function event(op:Operation,actor:string,status:string,db:DB) {
  await write("UPDATE wallet_operations SET status=? WHERE id=?",[status,op.id],db);
  await write("INSERT INTO wallet_operation_events(id,operation_id,actor_id,status) VALUES (?,?,?,?)",[randomUUID(),op.id,actor,status],db);
  await audit(actor,`WALLET_${status}`,"wallet_operations",op.id,{kind:op.kind,environment:op.environment},db);
  await notify(op.user_id,"PAYMENT_STATUS",`${op.id.slice(0,8)} · ${status}${op.environment==="DEMO"?" · SIMULATED — NO REAL MONEY":""}`,db);
  op.status=status;
}
async function journal(op:Operation,phase:string,debit:string,credit:string,db:DB) {
  for(const [book,direction] of [[debit,"DEBIT"],[credit,"CREDIT"]])
    await write("INSERT INTO wallet_journal(id,operation_id,phase,book,direction,amount,currency) VALUES (?,?,?,?,?,?,?)",[randomUUID(),op.id,phase,book,direction,op.amount,op.currency],db);
}
async function releaseReservation(op:Operation,db:DB) {
  const changed=await write("UPDATE accounts SET balance=balance+?,reserved_balance=reserved_balance-? WHERE id=? AND reserved_balance>=?",[op.amount,op.amount,op.account_id,op.amount],db);
  requireCondition(changed.affectedRows,"RESERVATION_MISMATCH");
  await journal(op,"RELEASE","RESERVED","AVAILABLE",db);
}
export async function submitWalletOperation(userId:string,input:unknown,key:string) {
  const v=inputSchema.parse(input);z.string().min(8).max(100).parse(key);
  requireCondition(v.kind !== "FUNDING_GATEWAY", "USE_PROVIDER_CHECKOUT");
  const hash=digest(JSON.stringify(v));
  return atomic(async db=>{
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[userId],db);
    const user=await customer(userId,db);
    const [old]=await rows<Operation>("SELECT * FROM wallet_operations WHERE user_id=? AND idempotency_key=?",[userId,key],db);
    if(old) {requireCondition(old.input_hash===hash,"IDEMPOTENCY_MISMATCH");return {id:old.id,status:old.status};}
    const [wallet]=await rows<{currency:string;balance:string}>("SELECT currency,balance FROM accounts WHERE id=? AND user_id=? AND archived=0 AND type<>'CASH' AND financial_environment=? FOR UPDATE",[v.account_id,userId,user.environment],db);
    requireCondition(wallet,"NOT_FOUND");validateWalletAmount(v.amount,wallet.currency);
    const [count]=await rows<{n:number}>("SELECT COUNT(*) n FROM wallet_operations WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)",[userId],db);
    requireCondition(count.n<20,"RATE_LIMITED");
    if(v.kind!=="FUNDING_MANUAL") await requireDemoFinance(userId,db);
    let parents:string[]=[];
    if(v.kind==="FUNDING_MANUAL") {
      const [receiving]=await rows<{minimum:string;maximum:string}>("SELECT minimum,maximum FROM manual_receiving_accounts WHERE id=? AND environment=? AND method=? AND currency=? AND active=1 FOR UPDATE",[v.receiving_account_id,user.environment,v.method,wallet.currency],db);
      requireCondition(receiving,"RECEIVING_ACCOUNT_UNAVAILABLE");
      requireCondition(D(v.amount).gte(receiving.minimum)&&D(v.amount).lte(receiving.maximum),"AMOUNT_LIMIT");
      requireCondition(v.reference.length>=3,"PAYMENT_REFERENCE_REQUIRED");
      validateIdentifier(v.method,v.identifier);
      const [duplicate]=await rows("SELECT id FROM wallet_operations WHERE receiving_account_id=? AND reference_hash=?",[v.receiving_account_id,digest(v.reference)],db);
      requireCondition(!duplicate,"DUPLICATE_REFERENCE");
    } else {
      requireCondition(manualMethods.includes(v.method as typeof manualMethods[number]),"PAYMENT_METHOD_DISABLED");
      validateIdentifier(v.method,v.identifier);
      requireCondition(!["BKASH","NAGAD","ROCKET"].includes(v.method)||wallet.currency==="BDT","UNSUPPORTED_CURRENCY");
      requireCondition(D(wallet.balance).gte(v.amount),"INSUFFICIENT_BALANCE");
      parents=await checkWithdrawalRisk(userId,v.account_id,v.amount,wallet.currency,db);
    }
    const op:Operation={id:randomUUID(),user_id:userId,account_id:v.account_id,environment:user.environment,kind:v.kind,method:v.method,
      amount:D(v.amount).toFixed(2),currency:wallet.currency,status:v.kind==="WITHDRAWAL_MANUAL"?(parents.length?"WAITING_PARENT":"PENDING_REVIEW"):"PENDING_VERIFICATION",input_hash:hash,operator_id:null};
    await write(`INSERT INTO wallet_operations(id,user_id,account_id,environment,kind,method,amount,currency,status,receiving_account_id,details_cipher,reference_hash,idempotency_key,input_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[op.id,userId,v.account_id,user.environment,v.kind,v.method,op.amount,wallet.currency,op.status,v.kind==="FUNDING_MANUAL"?v.receiving_account_id:null,
      encryptSecret(JSON.stringify({holder:v.holder,identifier:v.identifier,reference:v.reference})),v.kind==="FUNDING_MANUAL"?digest(v.reference):null,key,hash],db);
    if(v.kind==="WITHDRAWAL_MANUAL") {
      const update=await write("UPDATE accounts SET balance=balance-?,reserved_balance=reserved_balance+? WHERE id=? AND balance>=?",[op.amount,op.amount,v.account_id,op.amount],db);
      requireCondition(update.affectedRows,"INSUFFICIENT_BALANCE");await journal(op,"HOLD","AVAILABLE","RESERVED",db);
      for(const parent of parents) {
        await write("INSERT INTO wallet_operation_approvals(operation_id,parent_id) VALUES (?,?)",[op.id,parent],db);
        await notify(parent,"PAYMENT_APPROVAL",op.id,db);
      }
    }
    await event(op,userId,op.status,db);return {id:op.id,status:op.status};
  });
}
export async function reviewWalletOperation(actorId:string,operationId:string,decision:string,evidence:unknown={}) {
  requireCondition(decision !== "SIMULATE_GATEWAY", "USE_PROVIDER_CHECKOUT");
  id.parse(operationId);z.enum(["PROCESSING","EVIDENCE_RECORDED","COMPLETED","REJECTED","CANCELLED","PARENT_APPROVE","PARENT_REJECT"]).parse(decision);
  return atomic(async db=>{
    // Always lock user, then operation, then wallet: consistent with submission.
    const [preview]=await rows<Operation>("SELECT * FROM wallet_operations WHERE id=?",[operationId],db);requireCondition(preview,"NOT_FOUND");
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE",[preview.user_id],db);
    const [op]=await rows<Operation>("SELECT * FROM wallet_operations WHERE id=? FOR UPDATE",[operationId],db);
    requireCondition(op.kind !== "FUNDING_GATEWAY" || decision === "CANCELLED", "USE_PROVIDER_CHECKOUT");
    await requireSameEnvironment(actorId,op.user_id,db);
    const owner=op.user_id===actorId;
    if(decision.startsWith("PARENT_")) {
      const u=await financialIdentity(actorId,db);
      requireCondition(u.role==="PARENT"&&op.status==="WAITING_PARENT","INVALID_STATE");
      requireCondition((await rows("SELECT a.parent_id FROM wallet_operation_approvals a JOIN family_links f ON f.parent_id=a.parent_id AND f.student_id=? AND f.status='LINKED' WHERE a.operation_id=? AND a.parent_id=?",[op.user_id,op.id,actorId],db)).length,"FORBIDDEN");
      await write("UPDATE wallet_operation_approvals SET status=? WHERE operation_id=? AND parent_id=?",[decision==="PARENT_APPROVE"?"APPROVED":"REJECTED",op.id,actorId],db);
      if(decision==="PARENT_REJECT") {
        await releaseReservation(op,db);await event(op,actorId,"REJECTED",db);
      } else {
        const parents=await checkWithdrawalRisk(op.user_id,op.account_id,op.amount,op.currency,db,true,op.id);
        const approvals=await rows<{parent_id:string}>("SELECT parent_id FROM wallet_operation_approvals WHERE operation_id=? AND status='APPROVED'",[op.id],db);
        if(parents.every(p=>approvals.some(a=>a.parent_id===p))) await event(op,actorId,"PENDING_REVIEW",db);
      }
      return {id:op.id,status:op.status};
    }
    if(decision!=="CANCELLED") await operator(actorId,"settlements",db);
    else requireCondition(owner);
    if(op.status===decision) return {id:op.id,status:op.status};
    if(["REJECTED","CANCELLED"].includes(decision)) {
      requireCondition(["DRAFT","PENDING_REVIEW","PENDING_VERIFICATION","WAITING_PARENT"].includes(op.status),"INVALID_STATE");
      if(op.kind==="WITHDRAWAL_MANUAL") {
        await releaseReservation(op,db);
      }
      await event(op,actorId,decision,db);return {id:op.id,status:op.status};
    }
    // No user reference, screenshot or operator assertion can pass this boundary
    // for Live. A trusted statement/reconciliation adapter is still required.
    await requireDemoFinance(op.user_id,db);
    if(op.kind==="WITHDRAWAL_MANUAL") {
      const parents=await checkWithdrawalRisk(op.user_id,op.account_id,op.amount,op.currency,db,true,op.id);
      const approvals=await rows<{parent_id:string}>("SELECT parent_id FROM wallet_operation_approvals WHERE operation_id=? AND status='APPROVED'",[op.id],db);
      requireCondition(parents.every(p=>approvals.some(a=>a.parent_id===p)),"APPROVAL_REQUIRED");
    }
    if(decision==="PROCESSING") {
      requireCondition(["PENDING_REVIEW","PENDING_VERIFICATION"].includes(op.status),"INVALID_STATE");
      await write("UPDATE wallet_operations SET operator_id=? WHERE id=?",[actorId,op.id],db);
      await event(op,actorId,"PROCESSING",db);
    } else if(decision==="EVIDENCE_RECORDED") {
      requireCondition(op.status==="PROCESSING","INVALID_STATE");
      requireCondition(op.operator_id===actorId,"FORBIDDEN");
      const proof=z.object({reference:z.string().trim().min(3).max(190),amount:walletAmount,currency:z.string().length(3),settled_at:z.iso.datetime(),payee_verified:z.literal(true)}).strict().parse(evidence);
      requireCondition(D(proof.amount).eq(op.amount)&&proof.currency===op.currency&&Date.parse(proof.settled_at)<=Date.now(),"SETTLEMENT_MISMATCH");
      await write("UPDATE wallet_operations SET evidence_cipher=? WHERE id=?",[encryptSecret(JSON.stringify(proof)),op.id],db);
      await event(op,actorId,"PAID_PENDING_VERIFICATION",db);
    } else {
      requireCondition(op.status==="PAID_PENDING_VERIFICATION","INVALID_STATE");
      const [wallet]=await rows("SELECT id FROM accounts WHERE id=? AND archived=0 FOR UPDATE",[op.account_id],db);requireCondition(wallet,"ACCOUNT_INACTIVE");
      if(op.kind==="WITHDRAWAL_MANUAL") {
        const changed=await write("UPDATE accounts SET reserved_balance=reserved_balance-? WHERE id=? AND reserved_balance>=?",[op.amount,op.account_id,op.amount],db);
        requireCondition(changed.affectedRows,"RESERVATION_MISMATCH");await journal(op,"SETTLE","RESERVED","CLEARING",db);
      } else {
        await write("UPDATE accounts SET balance=balance+? WHERE id=?",[op.amount,op.account_id],db);
        await journal(op,"SETTLE","CLEARING","AVAILABLE",db);
      }
      await write("INSERT INTO transactions(id,user_id,account_id,amount,currency,type,category,description,notes,date) VALUES (?,?,?,?,?,?,'Other',?,'SIMULATED — NO REAL MONEY',UTC_DATE())",[randomUUID(),op.user_id,op.account_id,op.amount,op.currency,op.kind==="WITHDRAWAL_MANUAL"?"EXPENSE":"INCOME",`${op.kind} ${op.id}`],db);
      await write("UPDATE wallet_operations SET verified_by=? WHERE id=?",[actorId,op.id],db);
      await event(op,actorId,"COMPLETED",db);
    }
    return {id:op.id,status:op.status};
  });
}

export async function receivingAccounts(userId:string) {
  const u=await financialIdentity(userId);
  const list=await rows<Receiving>("SELECT * FROM manual_receiving_accounts WHERE environment=? AND active=1 ORDER BY display_order,method",[u.environment]);
  return list.map(({identifier_cipher,...r})=>({...r,identifier:decryptSecret(identifier_cipher)}));
}
export async function saveReceivingAccount(actorId:string,input:unknown) {
  const v=z.object({id:z.uuid().optional(),method:z.enum(manualMethods),holder:z.string().trim().min(2).max(160),identifier:z.string().trim().min(3).max(190),currency:z.string().regex(/^[A-Z]{3}$/),instructions:z.string().min(5).max(2000),minimum:walletAmount,maximum:walletAmount,active:z.boolean(),display_order:z.number().int().min(0).max(1000)}).strict().parse(input);
  validateIdentifier(v.method,v.identifier);validateWalletAmount(v.minimum,v.currency);validateWalletAmount(v.maximum,v.currency);
  requireCondition(D(v.maximum).gte(v.minimum),"AMOUNT_LIMIT");
  return atomic(async db=>{
    const u=await operator(actorId,"payment-methods",db);
    // Publishing Live receiving details could induce real deposits. Keep them
    // unpublished until the settlement adapter and operating approvals exist.
    requireCondition(u.is_demo||!v.active,"LIVE_RAIL_UNAVAILABLE");
    const accountId=v.id||randomUUID();
    if(v.id) {
      const [old]=await rows<{identifier_cipher:string;currency:string;method:string}>("SELECT * FROM manual_receiving_accounts WHERE id=? AND environment=? FOR UPDATE",[v.id,u.environment],db);
      requireCondition(old,"NOT_FOUND");
      requireCondition(decryptSecret(old.identifier_cipher)===v.identifier&&old.currency===v.currency&&old.method===v.method,"RECEIVING_IDENTITY_IMMUTABLE");
      await write("UPDATE manual_receiving_accounts SET holder=?,instructions=?,minimum=?,maximum=?,active=?,display_order=?,updated_by=? WHERE id=?",[v.holder,v.instructions,v.minimum,v.maximum,v.active,v.display_order,actorId,v.id],db);
    } else await write("INSERT INTO manual_receiving_accounts(id,environment,method,holder,identifier_cipher,currency,instructions,minimum,maximum,active,display_order,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[accountId,u.environment,v.method,v.holder,encryptSecret(v.identifier),v.currency,v.instructions,v.minimum,v.maximum,v.active,v.display_order,actorId],db);
    await audit(actorId,"RECEIVING_ACCOUNT_UPDATED","manual_receiving_accounts",accountId,{active:v.active,environment:u.environment},db);
    return {id:accountId};
  });
}
export async function addDiscoveredBeneficiary(userId:string,recipientId:string,currency:string) {
  const actor=await customer(userId);await requireSameEnvironment(userId,id.parse(recipientId));
  const [u]=await rows<{name:string;email:string;country_code:string}>("SELECT u.name,u.email,p.country_code FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=? AND u.discoverable=1 AND u.is_demo=? AND u.status='ACTIVE' AND u.role IN ('STUDENT','PARENT')",[recipientId,actor.is_demo]);
  requireCondition(u,"RECIPIENT_UNAVAILABLE");
  return createBeneficiary(userId,{name:u.name,destination:u.email,method:"INTERNAL",currency,country_code:u.country_code});
}
export async function sendInternal(userId:string,input:unknown,key:string) {
  const v=z.object({account_id:id,recipient_id:id,beneficiary_id:id.nullable(),amount:walletAmount}).strict().parse(input);
  const u=await customer(userId);await requireSameEnvironment(userId,v.recipient_id);
  const [recipient]=await rows<{name:string;email:string}>("SELECT name,email FROM users WHERE id=? AND status='ACTIVE' AND is_demo=?",[v.recipient_id,u.is_demo]);requireCondition(recipient,"RECIPIENT_UNAVAILABLE");
  const q=await validateFundingDraft(userId,{account_id:v.account_id,amount:v.amount});
  const draft=await createPaymentDraft(userId,{kind:"SEND",method:"INTERNAL",account_id:v.account_id,amount:v.amount,recipient:recipient.name,destination:recipient.email,beneficiary_id:v.beneficiary_id,receive_currency:q.wallet.currency,category:"Other",note:"Internal wallet transfer"},key);
  return confirmPayment(userId,draft.id);
}
export async function walletWorkspace(userId:string) {
  const u=await financialIdentity(userId);
  const [permissions]=await rows<{admin_permissions:string|null}>("SELECT admin_permissions FROM users WHERE id=?",[userId]);
  const admin=hasPermission({...u,...permissions},"settlements");
  const receivingAdmin=hasPermission({...u,...permissions},"payment-methods");
  const operations=await rows<{[key:string]:string|number|null}>(`SELECT o.id,o.user_id,o.account_id,o.kind,o.method,o.amount,o.currency,o.environment,o.status,o.created_at,o.details_cipher,u.name owner_name
    FROM wallet_operations o JOIN users u ON u.id=o.user_id WHERE o.environment=? AND (o.user_id=? OR ?=1 OR
      (o.status='WAITING_PARENT' AND EXISTS(SELECT 1 FROM wallet_operation_approvals a JOIN family_links f ON f.parent_id=a.parent_id AND f.student_id=o.user_id AND f.status='LINKED' WHERE a.operation_id=o.id AND a.parent_id=?))) ORDER BY o.created_at DESC LIMIT 100`,[u.environment,userId,admin,userId]);
  const sanitized=operations.map(({details_cipher,...r})=>{const details=JSON.parse(decryptSecret(String(details_cipher)));return {...r,holder:details.holder,identifier:identifierHint(details.identifier)};});
  const beneficiaries=await rows<{id:string;name:string;currency:string;status:string;recipient_id:string;role:string;email:string}>(`SELECT b.id,b.name,b.currency,b.status,u.id recipient_id,u.role,u.email FROM beneficiaries b JOIN users u ON LOWER(u.email)=LOWER(b.destination)
    WHERE b.user_id=? AND b.method='INTERNAL' AND b.status<>'REMOVED' AND u.is_demo=? AND u.status='ACTIVE' ORDER BY b.name`,[userId,u.is_demo]);
  const funding=await rows(`SELECT r.*,s.name student_name,p.name parent_name FROM family_funding_requests r JOIN users s ON s.id=r.student_id JOIN users p ON p.id=r.parent_id
    WHERE (r.student_id=? OR r.parent_id=?) AND r.environment=? ORDER BY r.created_at DESC LIMIT 100`,[userId,userId,u.environment]);
  const accounts=await rows("SELECT id,name,balance,reserved_balance,currency FROM accounts WHERE user_id=? AND archived=0 AND type<>'CASH' AND financial_environment=?",[userId,u.environment]);
  const receiving=receivingAdmin? (await rows<Receiving>("SELECT * FROM manual_receiving_accounts WHERE environment=? ORDER BY display_order,method",[u.environment])).map(({identifier_cipher,...r})=>({...r,identifier:decryptSecret(String(identifier_cipher))})) : await receivingAccounts(userId);
  return {environment:u.environment,operations:sanitized,receiving,accounts,family:await eligibleRecipients(userId),beneficiaries:beneficiaries.map(b=>({...b,email:String(b.email).replace(/^(.).*(@.*)$/,"$1***$2")})),funding,admin,receivingAdmin};
}
export { discoverRecipients };
