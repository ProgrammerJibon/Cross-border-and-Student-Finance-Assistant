"use client";
import { resultMessage } from "@/lib/result-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/ui/providers";
import { PaymentLogo } from "@/components/payments/payment-logo";
import { checkoutOptions, startProviderCheckout, completeProviderCheckout } from "@/actions/checkout.actions";
import { topupOptions, startTopupCheckout } from "@/actions/topup.actions";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types";
type Provider = "UNIONPAY" | "STRIPE" | "PAYPAL" | "ALIPAY" | "WECHAT";
type Quote = {amount:string;currency:string;environment:"sandbox"|"live";providers:Record<Provider,boolean>;testBuyer:null;provider?:Provider};
export const providerNames: Record<Provider,string> = {UNIONPAY:"Cards via Stripe (UnionPay where eligible)", STRIPE:"Stripe",PAYPAL:"PayPal",ALIPAY:"Alipay via Stripe",WECHAT:"WeChat Pay via Stripe"};

export function PaymentVerification({id}:{id:string}) {
  const {t}=useApp(); const router=useRouter();
  const [status,setStatus]=useState("CHECKOUT_PENDING");
  const checking=useRef(false);
  const [busy,setBusy]=useState(false);
  const verify=useCallback(async()=>{
    if(checking.current) return;checking.current=true;
    setBusy(true);
    try {const r=await completeProviderCheckout(id);setStatus(r.success?"checkoutVerified":r.code);if(r.success) router.refresh();}
    catch {setStatus("CHECKOUT_PROVIDER_ERROR");}
    finally {checking.current=false;setBusy(false);}
  },[id,router]);
  useEffect(()=>{if(status === "checkoutVerified") return;let count=0;const timer=setInterval(()=>{if(count++<24 && !document.hidden) void verify();},5000);return()=>clearInterval(timer);},[verify,status]);
  return <div role="status"><p>{t(status)}</p>{status!=="checkoutVerified" && <button type="button" className="button secondary" disabled={busy} onClick={()=>void verify()}>{t(busy?"loading":"verifyPayment")}</button>}</div>;
}

export function HostedCheckout({plan,requestId}:{plan?:Row;requestId?:string}) {
  const {t,locale}=useApp();
  const environment = "live" as const;
  const [provider,setProvider]=useState<Provider>("STRIPE");
  const [extraSeats,setExtraSeats]=useState(0);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [checkout,setCheckout]=useState<{id:string;url:string}|null>(null);
  const [reload,setReload]=useState(0);
  const [consent,setConsent]=useState(false);
  const request=useRef<{key:string;id:string}|null>(null);
  const planId=String(plan?.id || "");
  useEffect(()=>{
    let active=true;
    const load=requestId ? topupOptions({requestId,environment}) : checkoutOptions({plan:planId,cycle:"monthly",environment,extraSeats});
    void load.then(r=>{if(!active)return;if(r.success){setQuote(r.data);setError("");if("provider" in r.data) setProvider(r.data.provider as Provider)}else{setQuote(null);setError(resultMessage(r))}}).catch(()=>{if(active)setError("CHECKOUT_PROVIDER_ERROR")});
    return()=>{active=false};
  },[requestId,planId,environment,extraSeats,reload]);
  const start=async()=>{
    if(!quote || !consent || busy)return;
    const payWindow = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setBusy(true);setError("");
    const key=`${planId}-${environment}-${provider}-${extraSeats}`;
    if(request.current?.key!==key) request.current={key,id:crypto.randomUUID()};
    try {
      const r=requestId ? await startTopupCheckout({requestId,environment,locale,amount:quote.amount,currency:quote.currency}) : await startProviderCheckout({id:request.current.id,plan:planId,cycle:"monthly",environment,extraSeats,provider,locale,amount:quote.amount,currency:quote.currency});
      if(r.success){
        setCheckout(r.data);
        if(payWindow && !payWindow.closed){
          try {
            payWindow.location.href = r.data.url;
            payWindow.focus();
          } catch {
            window.location.assign(r.data.url);
          }
        } else {
          window.location.assign(r.data.url);
        }
      }
      else{payWindow?.close();setError(resultMessage(r))}
    } catch (e) {
      console.error("Hosted checkout error:", e);
      payWindow?.close();
      setError("CHECKOUT_PROVIDER_ERROR");
    }
    finally{setBusy(false)}
  };
  return <div className="hosted-checkout">
    
    {planId==="family-pro" && <label>{t("additionalProStudents")}<input type="number" min={0} max={100} value={extraSeats} disabled={busy || !!checkout} onChange={e=>{setExtraSeats(Math.min(100,Math.max(0,Math.trunc(Number(e.target.value)||0))));setQuote(null);setConsent(false)}} /></label>}
    {!requestId && <div className="provider-options" role="radiogroup" aria-label={t("choosePaymentMethod")}>{(["UNIONPAY","STRIPE","PAYPAL"] as const).map(p=><button type="button" role="radio" aria-checked={provider===p} key={p} className={`provider-option ${provider===p?"selected":""}`} disabled={busy || !!checkout || !quote?.providers[p]} onClick={()=>{setProvider(p);setConsent(false)}}><PaymentLogo method={p}/><strong>{providerNames[p]}</strong><small>{t(p==="STRIPE"?"stripeFullCheckout":p==="UNIONPAY"?"unionpayViaStripe":"paypalCheckout")}</small></button>)}</div>}
    {requestId && <h3><PaymentLogo method={provider}/> {providerNames[provider]}</h3>}
    {provider!=="PAYPAL" && <p className="muted"><PaymentLogo method="STRIPE"/> {t("poweredByStripe")}</p>}
    {quote && <p className="checkout-total"><strong>{formatMoney(quote.amount,quote.currency,locale)}</strong> {plan?t("perMonth"):""}<small>{t("providerCurrencyNote")}</small></p>}
    <p>{t(plan?"recurringConsentHelp":"liveTopupHelp")}</p>
    {checkout ? <><a className="text-link" href={checkout.url} target="_blank" rel="noreferrer">{t("reopenCheckout")}</a><PaymentVerification id={checkout.id}/></> : <>
      <label className="checkbox-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t(plan?"authorizeSubscription":"authorizePayment")}</label>
      {quote && !quote.providers[provider] && <p role="status">{t("CHECKOUT_NOT_CONFIGURED")}</p>}
      <button type="button" className="button full" disabled={busy || !quote?.providers[provider] || !consent} onClick={()=>void start()}>{t(busy?"loading":"continueSecureCheckout")}</button>
      <button type="button" className="text-link" disabled={busy} onClick={()=>{setQuote(null);setReload(v=>v+1)}}>{t("refreshCheckout")}</button>
    </>}
    {error && <p role="alert" className="checkout-error">{t(error)}</p>}
  </div>;
}
