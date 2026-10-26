"use client";
import { resultMessage } from "@/lib/result-message";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/ui/providers";
import { Card, Heading, Modal, FormFields, DataCards, type Field } from "@/components/ui/primitives";
import { getWalletWorkspace, validateFunding, submitWallet, reviewWallet, saveReceiving, searchRecipients, saveRecipient, sendToRecipient, requestSupport, decideSupport, setDiscoverable, operationDetails } from "@/actions/wallet.actions";
import { getPayments, parentPaymentDecision, parentBeneficiaryDecision, removeBeneficiary } from "@/actions/payment.actions";
import type { Workspace } from "@/types/workspace";
import type { Row, Result } from "@/types";
import { manualMethods } from "@/lib/wallet-rules";
import { D } from "@/lib/money";
import { DemoPaymentCard } from "./demo-payment-card";
import { PaymentVerification } from "@/components/billing/hosted-checkout";
import { ProviderPaymentHistory } from "@/components/billing/provider-checkout";
import { GatewaySettings } from "./gateway-settings";
import { prepareTopup, topupOptions, startTopupCheckout } from "@/actions/topup.actions";

type State=Extract<Awaited<ReturnType<typeof getWalletWorkspace>>,{success:true}>["data"];
type Legacy=Extract<Awaited<ReturnType<typeof getPayments>>,{success:true}>["data"];
const opts=(values:readonly string[])=>values.map(v=>({value:v,label:v}));
export function WalletWorkspace({data,mode="payments",compact=false,initialKind="SEND",initialAccount=""}:{data:Workspace;mode?:string;compact?:boolean;initialKind?:string;initialAccount?:string}) {
  const {t,locale,setFieldErrors}=useApp();const search=useSearchParams();
  const [ws,setWs]=useState<State|null>(null),[legacy,setLegacy]=useState<Legacy|null>(null);
  const [modal,setModal]=useState(""),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [form,setForm]=useState<Record<string,string>>({}),[key,setKey]=useState("");
  const [matches,setMatches]=useState<{id:string;name:string;email:string;role:string}[]>([]);
  const [recipientPage,setRecipientPage]=useState(0);
  const [shortfall,setShortfall]=useState("");
  const [details,setDetails]=useState<{holder:string;identifier:string;reference:string}|null>(null);
  const [gatewayQuote,setGatewayQuote]=useState<{requestId:string;amount:string;currency:"USD"}|null>(null);
  const updateFunding=(values:Record<string,string>)=>{
    setForm(values);setKey(crypto.randomUUID());setGatewayQuote(null);setStep(0);setShortfall("");
  };
  const draftStorage=`finance-draft:${data.user.id}:${data.user.is_demo?"DEMO":"LIVE"}`;
  const refresh=useCallback(async()=>{
    const [r,h]=await Promise.all([getWalletWorkspace(),getPayments()]);
    if(r.success)setWs(r.data);else setError(resultMessage(r));
    if(h.success)setLegacy(h.data);
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh,data]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>clearInterval(timer);},[refresh]);
  useEffect(()=>{
    if(modal!=="beneficiary"||!form.query||form.query.trim().length<3) return;
    let current=true;
    const timer=setTimeout(()=>void searchRecipients(form.query,recipientPage).then(r=>{if(current) {setMatches(r.success?r.data:[]);if(!r.success)setError(resultMessage(r));}}).catch(()=>{if(current)setError("NETWORK_ERROR");}),350);
    return()=>{current=false;clearTimeout(timer);};
  },[modal,form.query,recipientPage]);
  // Persist only non-sensitive draft fields. Sender identifiers, proof and account
  // numbers remain in form memory and encrypted server records, never web storage.
  useEffect(()=>{
    if(!["fund","send","withdraw","support","supportSend"].includes(modal))return;
    try {sessionStorage.setItem(draftStorage,JSON.stringify({modal,key,form:{account_id:form.account_id,amount:form.amount,type:form.type,recipient_id:form.recipient_id,beneficiary_id:form.beneficiary_id,parent_id:form.parent_id,method:form.method,receiving_account_id:form.receiving_account_id,request_id:form.request_id,currency:form.currency}}));}catch{}
  },[form,modal,key,draftStorage]);
  const account=ws?.accounts.find(a=>a.id===form.account_id);
  const demo=!!data.user.is_demo;
  const perform=async<T,>(fn:()=>Promise<Result<T>>,close=true)=>{
    setBusy(true);setError("");
    try {const result=await fn();if(!result.success){setFieldErrors(result.fieldErrors||{});setError(result.fieldErrors?Object.entries(result.fieldErrors).map(([f,m])=>`${t(f)}: ${m}`).join(" "):result.code);return undefined;}
      await refresh();if(close){setModal("");try{sessionStorage.removeItem(draftStorage);}catch{}}
      return result.data;
    }catch{setError("NETWORK_ERROR");return undefined;}finally{setBusy(false);}
  };
  const open=(kind:string,extra:Record<string,string>={})=>{
    const first=ws?.accounts.find(a=>a.id===(initialAccount||search.get("account")))||ws?.accounts[0];
    setForm({account_id:String(first?.id||""),amount:search.get("amount")||"",type:demo?"Gateway":"Manual",method:"STRIPE",holder:data.user.name,identifier:"",reference:"",...extra});
    setKey(crypto.randomUUID());setGatewayQuote(null);setStep(0);setRecipientPage(0);setError("");setShortfall("");setModal(kind);
  };
  const resume=()=>{try{const saved=JSON.parse(sessionStorage.getItem(draftStorage)||"null");if(saved){setForm({...saved.form,holder:data.user.name,identifier:"",reference:""});setKey(saved.key);setStep(0);setModal(saved.modal);}}catch{}};
  const wallets=(ws?.accounts||[]).map(a=>({value:String(a.id),label:`${a.name} · ${a.currency} · ${a.balance}`}));
  const walletFields:Field[]=[{name:"account_id",label:"sourceWallet",options:wallets},{name:"amount",type:"number",min:0.01}];
  const parentAction=(r:Row,decision:string)=>void perform(()=>parentPaymentDecision({id:r.id,approve:decision==="APPROVE",reason:decision}),false);
  const fundShortage=()=>{
    // Preserve the outgoing draft independently; completion only exposes Resume.
    try {sessionStorage.setItem(`${draftStorage}:outgoing`,JSON.stringify({modal,key,form:{account_id:form.account_id,amount:form.amount,recipient_id:form.recipient_id,beneficiary_id:form.beneficiary_id,parent_id:form.parent_id,request_id:form.request_id,currency:form.currency,method:form.method}}));}catch{}
    open("fund",{account_id:form.account_id,amount:shortfall});
  };
  return <section className="payments-panel">
    {!compact&&<Heading title={t(mode==="beneficiaries"?"beneficiaries":mode==="settlements"?"settlements":mode==="payment-methods"?"payment-methods":"financeWorkspace")} subtitle={t("internalScope")}/>}
    {!demo&&<p role="status">{t("liveMoneyBlocked")}</p>}
    {error&&<p role="alert">{t(error)}</p>}
    {!ws?<p>{t("loading")}</p>:<>
      {ws.receivingAdmin&&<GatewaySettings demo={demo}/>}
      {["STUDENT","PARENT"].includes(data.user.role)&&<>
        <div className="button-group">
          <button className="button" disabled={!wallets.length} onClick={()=>open("fund")}>{t("addMoney")}</button>
          <button className="button" disabled={!wallets.length} onClick={()=>open("send")}>{t("sendInternal")}</button>
          <button className="button secondary" disabled={!wallets.length} onClick={()=>open("withdraw",{method:"UNIONPAY"})}>{t("withdrawMoney")}</button>
          {data.user.role==="STUDENT"&&<button className="button secondary" onClick={()=>open("support")}>{t("requestMoney")}</button>}
          <button className="button secondary" onClick={resume}>{t("resumeDraft")}</button>
          <button className="button secondary" onClick={()=>{try{const saved=sessionStorage.getItem(`${draftStorage}:outgoing`);if(saved){const r=JSON.parse(saved);setForm(r.form);setKey(r.key);setModal(r.modal);setStep(0);setShortfall("");}}catch{}}}>{t("resumeTransfer")}</button>
        </div>
        {search.get("checkout")&&(search.get("cancelled")==="1"?<p role="status">{t("gatewayCancelled")}</p>:<PaymentVerification id={search.get("checkout")!}/>)}
        {search.get("kind")&&<button className="button" onClick={()=>open(search.get("kind")==="TOPUP"?"fund":search.get("kind")==="WITHDRAW"?"withdraw":"send")}>{t("openRequestedFlow")}</button>}
        {compact&&<button className="button secondary" onClick={()=>open(initialKind==="TOPUP"?"fund":initialKind==="WITHDRAW"?"withdraw":"send")}>{t("openRequestedFlow")}</button>}
        <div className="three-grid">{ws.accounts.map(a=><Card key={String(a.id)}><h3>{a.name} · {a.currency}</h3><p>{t("available")}: {a.balance}</p><p>{t("reservedFunds")}: {a.reserved_balance}</p><button className="text-link" onClick={()=>open("fund",{account_id:String(a.id)})}>{t("addMoney")}</button></Card>)}</div>
        <ProviderPaymentHistory/>
        <Card><h2>{t("eligibleFamily")}</h2>{!ws.family.length&&<p>{t("noEligibleFamily")}</p>}
          {ws.family.map(r=><p key={r.id}>{r.name} · {t(r.role)} · {r.email} <button className="button secondary" onClick={()=>open("send",{recipient_id:r.id,beneficiary_id:""})}>{t("sendInternal")}</button></p>)}
        </Card>
        <Card><h2>{t("beneficiaries")}</h2><button className="button" onClick={()=>{setMatches([]);open("beneficiary");}}>{t("addBeneficiary")}</button>
          <p>{t("discoveryConsent")}</p><button className="text-link" onClick={()=>void perform(()=>setDiscoverable(true),false)}>{t("enableDiscovery")}</button>{" "}<button className="text-link" onClick={()=>void perform(()=>setDiscoverable(false),false)}>{t("disableDiscovery")}</button>
          <DataCards rows={ws.beneficiaries} columns={[{key:"name"},{key:"email"},{key:"currency"},{key:"status"}]} actions={r=><><button className="button secondary" disabled={r.status!=="APPROVED"} onClick={()=>open("send",{recipient_id:String(r.recipient_id),beneficiary_id:String(r.id)})}>{t("sendInternal")}</button><button className="text-link" onClick={()=>void perform(()=>removeBeneficiary(String(r.id)),false)}>{t("remove")}</button></>}/>
        </Card>
        <Card><h2>{t("familyFunding")}</h2><DataCards rows={ws.funding} columns={[{key:"student_name"},{key:"parent_name"},{key:"amount"},{key:"currency"},{key:"status"},{key:"reason"}]} actions={r=><>
          {r.parent_id===data.user.id&&r.status==="PENDING_PARENT_APPROVAL"&&<><button className="button" onClick={()=>void perform(()=>decideSupport(String(r.id),"APPROVE"),false)}>{t("approveSupport")}</button><button className="button secondary" onClick={()=>void perform(()=>decideSupport(String(r.id),"DECLINE"),false)}>{t("decline")}</button></>}
          {r.parent_id===data.user.id&&r.status==="APPROVED_AWAITING_FUNDS"&&<button className="button" onClick={()=>open("supportSend",{request_id:String(r.id),amount:String(r.amount),recipient_id:String(r.student_id),currency:String(r.currency)})}>{t("confirmAndSend")}</button>}
          {r.student_id===data.user.id&&["PENDING_PARENT_APPROVAL","APPROVED_AWAITING_FUNDS"].includes(String(r.status))&&<button className="text-link" onClick={()=>void perform(()=>decideSupport(String(r.id),"CANCEL"),false)}>{t("cancel")}</button>}
        </>}/></Card>
      </>}
      {ws.receivingAdmin&&<Card><h2>{t("receivingAccounts")}</h2><button className="button" onClick={()=>open("receiving",{method:"UNIONPAY",currency:"CNY",minimum:"1",maximum:"100000",active:"0",display_order:"0"})}>{t("addAccount")}</button>
        <DataCards rows={ws.receiving} columns={[{key:"method"},{key:"holder"},{key:"currency"},{key:"active"},{key:"environment"}]} actions={r=><button className="button secondary" onClick={()=>{setForm(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v??"")])));setModal("receiving");}}>{t("edit")}</button>}/>
      </Card>}
      <Card><h2>{t("fundingWithdrawalHistory")}</h2><p>{t("manualPendingHelp")}</p><DataCards rows={ws.operations} columns={[{key:"kind"},{key:"method"},{key:"amount"},{key:"currency"},{key:"status"},{key:"holder"},{key:"identifier"},{key:"created_at"}]} actions={r=><>
        {data.user.role==="PARENT"&&r.status==="WAITING_PARENT"&&r.user_id!==data.user.id&&<><button className="button" onClick={()=>void perform(()=>reviewWallet(String(r.id),"PARENT_APPROVE"),false)}>{t("approve")}</button><button className="text-link" onClick={()=>void perform(()=>reviewWallet(String(r.id),"PARENT_REJECT"),false)}>{t("reject")}</button></>}
        {r.user_id===data.user.id&&["DRAFT","PENDING_REVIEW","PENDING_VERIFICATION","WAITING_PARENT"].includes(String(r.status))&&<button className="text-link" onClick={()=>void perform(()=>reviewWallet(String(r.id),"CANCELLED"),false)}>{t("cancel")}</button>}
        {ws.admin&&<>
          <button className="text-link" onClick={()=>void perform(()=>operationDetails(String(r.id)),false).then(v=>{if(v){setDetails(v);setModal("details");}})}>{t("viewPaymentDetails")}</button>
          {["PENDING_REVIEW","PENDING_VERIFICATION"].includes(String(r.status))&&<><button className="button" disabled={!demo} onClick={()=>void perform(()=>reviewWallet(String(r.id),"PROCESSING"),false)}>{t("startReview")}</button><button className="text-link" onClick={()=>void perform(()=>reviewWallet(String(r.id),"REJECTED"),false)}>{t("reject")}</button></>}
          {r.status==="PROCESSING"&&<button className="button" onClick={()=>{setForm({id:String(r.id),amount:String(r.amount),currency:String(r.currency),reference:"",settled_at:new Date().toISOString(),payee_verified:"0"});setModal("evidence");}}>{t("recordEvidence")}</button>}
          {r.status==="PAID_PENDING_VERIFICATION"&&<button className="button" disabled={!demo} onClick={()=>void perform(()=>reviewWallet(String(r.id),"COMPLETED"),false)}>{t("verifySimulation")}</button>}
        </>}
      </>}/></Card>
      {legacy&&<Card><h2>{t("internalHistory")}</h2><DataCards rows={legacy.requests} columns={[{key:"recipient"},{key:"amount"},{key:"currency"},{key:"status"}]} actions={r=>data.user.role==="PARENT"&&r.status==="WAITING_PARENT"&&r.user_id!==data.user.id?<><button className="button" onClick={()=>parentAction(r,"APPROVE")}>{t("approve")}</button><button className="text-link" onClick={()=>parentAction(r,"REJECT")}>{t("reject")}</button></>:null}/>
        {data.user.role==="PARENT"&&<DataCards rows={legacy.beneficiaries.filter(b=>b.user_id!==data.user.id&&b.status==="PENDING")} columns={[{key:"name"},{key:"status"}]} actions={b=><><button className="button" onClick={()=>void perform(()=>parentBeneficiaryDecision({id:b.id,approve:true,reason:"Approved beneficiary"}),false)}>{t("approve")}</button><button className="text-link" onClick={()=>void perform(()=>parentBeneficiaryDecision({id:b.id,approve:false,reason:"Rejected beneficiary"}),false)}>{t("reject")}</button></>}/>}</Card>}
    </>}
    {modal&&<Modal title={t({fund:"addMoney",send:"sendInternal",withdraw:"withdrawMoney",support:"requestMoney",supportSend:"confirmAndSend",beneficiary:"addBeneficiary",receiving:"receivingAccounts",evidence:"recordEvidence",details:"viewPaymentDetails"}[modal]||modal)} onClose={()=>{if(!busy){setModal("");setDetails(null);}}}>
      {error&&<p role="alert">{t(error)}</p>}
      {details&&modal==="details"?<><p>{details.holder}</p><p>{details.identifier}</p><p>{details.reference}</p></>:<form onSubmit={async e=>{
        e.preventDefault();if(busy)return;setError("");
        if(modal==="fund"&&form.type==="Gateway") {
          if(step===0||!gatewayQuote) {
            const quote=await perform(async()=>{
              const draft=await prepareTopup({id:key,account_id:form.account_id,amount:form.amount,provider:form.method});
              if(!draft.success)return draft;
              const result=await topupOptions(draft.data);
              return result.success?{success:true as const,data:{requestId:draft.data.requestId,amount:result.data.amount,currency:"USD" as const}}:result;
            },false);
            if(quote){setGatewayQuote(quote);setStep(1);}
          } else {
            const checkout=await perform(()=>startTopupCheckout({...gatewayQuote,locale}),false);
            if(checkout)window.location.assign(checkout.url);
          }
          return;
        }
        if(["fund","withdraw","send","supportSend"].includes(modal)&&step===0) {
          const q=await perform(()=>validateFunding({account_id:form.account_id,amount:form.amount}),false);if(!q)return;
          if(modal!=="fund"&&D(q.wallet.balance).lt(form.amount)){setShortfall(D(form.amount).minus(q.wallet.balance).toFixed(2));return;}
          setStep(1);return;
        }
        if(modal==="fund"||modal==="withdraw") {
          const receiving=ws?.receiving.find(r=>r.id===form.receiving_account_id);
          await perform(()=>submitWallet({account_id:form.account_id,amount:form.amount,kind:modal==="withdraw"?"WITHDRAWAL_MANUAL":"FUNDING_MANUAL",method:modal==="fund"?String(receiving?.method||""):form.method,receiving_account_id:form.receiving_account_id||"",holder:form.holder||data.user.name,identifier:form.identifier||"",reference:form.reference||""},key));
        } else if(modal==="send") await perform(()=>sendToRecipient({account_id:form.account_id,amount:form.amount,recipient_id:form.recipient_id,beneficiary_id:form.beneficiary_id||null},key));
        else if(modal==="support") await perform(()=>requestSupport({parent_id:form.parent_id,amount:form.amount,currency:String(account?.currency||""),reason:form.reason||""},key));
        else if(modal==="supportSend") {const r=await perform(()=>decideSupport(form.request_id,"SEND",form.account_id),false);if(r&&"shortfall" in r){setShortfall(String(r.shortfall));}else if(r){setModal("");}}
        else if(modal==="beneficiary") await perform(()=>saveRecipient(form.recipient_id,String(account?.currency||"")));
        else if(modal==="receiving") await perform(()=>saveReceiving({...(form.id?{id:form.id}:{}),method:form.method,holder:form.holder,identifier:form.identifier,currency:form.currency,instructions:form.instructions,minimum:form.minimum,maximum:form.maximum,active:form.active==="1",display_order:Number(form.display_order)}));
        else if(modal==="evidence") await perform(()=>reviewWallet(form.id,"EVIDENCE_RECORDED",{reference:form.reference,amount:form.amount,currency:form.currency,settled_at:form.settled_at,payee_verified:form.payee_verified==="1"}));
      }}>
        <fieldset className="payment-form-fields" disabled={busy}>
        {["fund","withdraw","send","supportSend","support"].includes(modal)&&<>
          <FormFields fields={modal==="supportSend"?walletFields.slice(0,1):modal==="fund"?[{...walletFields[0],label:"destinationWallet"},walletFields[1]]:walletFields} values={form} setValues={v=>updateFunding({...v,receiving_account_id:v.account_id!==form.account_id?"":v.receiving_account_id})}/>
          {modal==="supportSend"&&<p>{t("amount")}: {form.amount} {form.currency}</p>}
          <p>{t("fee")}: 0 · {t("currency")}: {account?.currency} · {t("available")}: {account?.balance}</p>
        </>}
        {modal==="fund"&&<>
          <FormFields fields={[{name:"type",label:"depositType",options:[{value:"Gateway",label:"gateway"},{value:"Manual",label:"Manual"}]}]} values={form} setValues={updateFunding}/>
          {form.type==="Gateway"?<><FormFields fields={[{name:"method",options:opts(["STRIPE","PAYPAL"])}]} values={form} setValues={updateFunding}/>{demo?<><p>{t("sandboxGatewayHelp")}</p><DemoPaymentCard provider={form.method}/></>:<p role="status">{t("gatewayFundingUnavailable")}</p>}{step===1&&gatewayQuote&&<p className="checkout-total">{t("gatewayQuote")}: {gatewayQuote.amount} USD → {form.amount} {account?.currency}. {t("verifiedFundingOnly")}</p>}</>:step===1&&<>
            <FormFields fields={[{name:"receiving_account_id",label:"receivingAccounts",options:(ws?.receiving||[]).filter(r=>r.active&&r.currency===account?.currency).map(r=>({value:String(r.id),label:`${r.method} · ${r.holder}`}))}]} values={form} setValues={setForm}/>
            {ws?.receiving.filter(r=>r.id===form.receiving_account_id).map(r=><Card key={String(r.id)}><p>{r.holder}: {r.identifier}</p><p>{r.instructions}</p><p>{r.minimum} – {r.maximum} {r.currency}</p></Card>)}
            <FormFields fields={[{name:"holder",label:"senderName"},{name:"identifier",label:"senderIdentifier"},{name:"reference",label:"transactionId"}]} values={form} setValues={setForm}/><p>{t("manualPendingHelp")}</p>
          </>}
        </>}
        {modal==="withdraw"&&<><FormFields fields={[{name:"method",options:opts(manualMethods)},{name:"holder",label:"recipientAccountName"},{name:"identifier",label:form.method==="PAYPAL"?"email":"recipientAccountId"}]} values={form} setValues={v=>{setForm(v);setStep(0);}}/><p>{t("withdrawalManualHelp")}</p></>}
        {modal==="send"&&<FormFields fields={[{name:"recipient_id",label:"recipient",options:[...(ws?.family||[]).map(r=>({value:r.id,label:`${r.name} · ${r.email} · ${t("family")}`})),...(ws?.beneficiaries||[]).filter(b=>b.status==="APPROVED"&&b.currency===account?.currency).map(b=>({value:String(b.recipient_id),label:`${b.name} · ${b.email}`}))]}]} values={form} setValues={v=>{const b=ws?.beneficiaries.find(b=>b.recipient_id===v.recipient_id&&b.currency===account?.currency&&b.status==="APPROVED");setForm({...v,beneficiary_id:String(b?.id||"")});setStep(0);}}/>}
        {modal==="support"&&<FormFields fields={[{name:"parent_id",label:"parent",options:(ws?.family||[]).filter(r=>r.role==="PARENT").map(r=>({value:r.id,label:r.name}))},{name:"reason",required:false,type:"textarea"}]} values={form} setValues={setForm}/>}
        {modal==="beneficiary"&&<><FormFields fields={[{name:"account_id",label:"currency",options:wallets},{name:"query",label:"recipientSearch"},{name:"recipient_id",label:"recipient",options:matches.map(r=>({value:r.id,label:`${r.name} · ${r.role} · ${r.email}`}))}]} values={form} setValues={v=>{setForm(v.query!==form.query?{...v,recipient_id:""}:v);if(v.query!==form.query){setMatches([]);setRecipientPage(0);}}}/><p>{t("discoveryPrivacyHelp")}</p><div className="button-group"><button type="button" className="button secondary" disabled={recipientPage===0} onClick={()=>{setRecipientPage(p=>p-1);setMatches([]);setForm({...form,recipient_id:""});}}>{t("back")}</button><button type="button" className="button secondary" disabled={matches.length<10||recipientPage>=4} onClick={()=>{setRecipientPage(p=>p+1);setMatches([]);setForm({...form,recipient_id:""});}}>{t("next")}</button></div></>}
        {modal==="receiving"&&<FormFields fields={[{name:"method",options:opts(manualMethods)},{name:"holder"},{name:"identifier",label:"recipientAccountId"},{name:"currency"},{name:"instructions",type:"textarea"},{name:"minimum",type:"number"},{name:"maximum",type:"number"},{name:"display_order",type:"number"},{name:"active",options:opts(["0","1"])}]} values={form} setValues={setForm}/>}
        {modal==="evidence"&&<><p>{t("demoEvidenceHelp")}</p><FormFields fields={[{name:"reference",label:"settlementEvidence"},{name:"amount"},{name:"currency"},{name:"settled_at"},{name:"payee_verified",label:"payeeVerified",options:[{value:"0",label:"no"},{value:"1",label:"yes"}]}]} values={form} setValues={setForm}/></>}
        {step===1&&!(modal==="fund"&&form.type==="Gateway")&&<p>{t("finalConfirmationHelp")} · {account?.name} · {form.amount} {account?.currency} · {modal==="send"?(ws?.family.find(r=>r.id===form.recipient_id)?.name||ws?.beneficiaries.find(r=>r.recipient_id===form.recipient_id)?.name):form.holder||""} · {t("available")}: {account&&D(String(account.balance)).minus(modal==="fund"?0:form.amount||0).toFixed(2)}</p>}
        {shortfall&&<div role="alert"><p>{t("shortfall")}: {shortfall} {account?.currency}</p><button type="button" className="button" onClick={fundShortage}>{t("addMoney")}</button></div>}
        <div className="button-group"><button className="button" disabled={busy||(!demo&&((modal==="fund"&&form.type==="Gateway")||(step===1&&["withdraw","send","supportSend"].includes(modal))))}>{t(modal==="fund"&&form.type==="Gateway"?(step===0?"review":"openProviderCheckout"):step===0&&["fund","withdraw","send","supportSend"].includes(modal)?"next":"confirm")}</button>{step>0&&<button className="button secondary" type="button" disabled={busy} onClick={()=>setStep(0)}>{t("back")}</button>}</div>
        </fieldset>
      </form>}
    </Modal>}
  </section>;
}
