"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/ui/providers";
import { Card, FormFields, Modal } from "@/components/ui/primitives";
import { prepareTopup, topupOptions, startTopupCheckout } from "@/actions/topup.actions";
import { PaymentVerification } from "@/components/billing/hosted-checkout";
import { ProviderPaymentHistory } from "@/components/billing/provider-checkout";
import type { Workspace } from "@/types/workspace";

export function GatewayAddMoney({data}:{data:Workspace}) {
  const {t,run,locale}=useApp();
  const search=useSearchParams();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [key,setKey]=useState("");
  const [form,setForm]=useState<Record<string,string>>({});
  const [quote,setQuote]=useState<{requestId:string;amount:string;currency:"USD"}|null>(null);
  const wallets=data.accounts.filter(a=>a.type!=="CASH").map(a=>({value:String(a.id),label:`${a.name} · ${a.currency}`}));
  const checkout=search.get("checkout"),cancelled=search.get("cancelled")==="1";
  return <Card><h2>{t("gatewayAddMoney")}</h2>
    <p>{t(data.user.is_demo?"sandboxGatewayHelp":"gatewayFundingUnavailable")}</p>
    <button className="button" disabled={!data.user.is_demo||!wallets.length} onClick={()=>{setKey(crypto.randomUUID());setForm({account_id:wallets[0]?.value||"",amount:"",provider:"STRIPE"});setQuote(null);setOpen(true);}}>{t("gatewayAddMoney")}</button>
    {checkout&&(cancelled?<p role="status">{t("gatewayCancelled")}</p>:<PaymentVerification id={checkout}/>)}
    <ProviderPaymentHistory/>
    {open&&<Modal title={t("gatewayAddMoney")} onClose={()=>{if(!busy)setOpen(false);}}>
      <form onSubmit={async e=>{
        e.preventDefault();setBusy(true);
        try {
          if(!quote) {
            const draft=await run(()=>prepareTopup({...form,id:key}),{quiet:true,refresh:false});
            if(!draft)return;
            const q=await run(()=>topupOptions(draft),{quiet:true,refresh:false});
            if(q)setQuote({...draft,amount:q.amount,currency:"USD"});
          } else {
            const result=await run(()=>startTopupCheckout({...quote,locale}),{quiet:true,refresh:false});
            if(result)window.location.assign(result.url);
          }
        } finally {setBusy(false);}
      }}>
        {!quote?<FormFields fields={[{name:"account_id",label:"destinationWallet",options:wallets},{name:"amount",type:"number",min:0.01},{name:"provider",options:[{value:"STRIPE",label:"Stripe"},{value:"PAYPAL",label:"PayPal"}]}]} values={form} setValues={v=>{setForm(v);setKey(crypto.randomUUID());}}/>:<p>{t("gatewayQuote")}: {quote.amount} USD → {form.amount} {data.accounts.find(a=>a.id===form.account_id)?.currency}. {t("verifiedFundingOnly")}</p>}
        <button className="button" disabled={busy}>{t(quote?"openProviderCheckout":"review")}</button>
      </form>
    </Modal>}
  </Card>;
}
