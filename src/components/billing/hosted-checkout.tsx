"use client";
import { GuidedInput } from "@/components/ui/dashboard-guidance";
import { resultMessage } from "@/lib/result-message";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { FiCheckCircle } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { PaymentLogo } from "@/components/payments/payment-logo";
import { checkoutOptions, startProviderCheckout, completeProviderCheckout } from "@/actions/checkout.actions";
import { topupOptions, startTopupCheckout } from "@/actions/topup.actions";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types";
type Provider = "UNIONPAY" | "STRIPE" | "PAYPAL" | "ALIPAY" | "WECHAT";
type Quote = {amount:string;currency:string;environment:"sandbox"|"live";providers:Record<Provider,boolean>;testBuyer:null;provider?:Provider};
export const providerNames: Record<Provider,string> = {UNIONPAY:"Cards via Stripe (UnionPay where eligible)", STRIPE:"Stripe",PAYPAL:"PayPal",ALIPAY:"Alipay via Stripe",WECHAT:"WeChat Pay via Stripe"};

export function PaymentVerification({id,onClose}:{id:string;onClose?:()=>void}) {
  return <VerificationDialog key={id} id={id} onClose={onClose}/>;
}
function VerificationDialog({id,onClose}:{id:string;onClose?:()=>void}) {
  const {t}=useApp(); const router=useRouter(); const pathname=usePathname();
  const [status,setStatus]=useState("CHECKOUT_PENDING");
  const [open,setOpen]=useState(true);
  const [busy,setBusy]=useState(false);
  const verifyNow=useRef<(()=>Promise<void>)|null>(null);
  const succeeded=status==="checkoutVerified";
  const terminal=["INVALID_STATE","NOT_FOUND","FORBIDDEN","UNAUTHORIZED","ENVIRONMENT_MISMATCH","CHECKOUT_MISMATCH","VALIDATION_ERROR"].includes(status);
  useEffect(()=>{
    if(!open)return;
    let active=true,checking=false,finished=false;
    const verify=async()=>{
      if(checking||finished||!active)return;
      checking=true;setBusy(true);
      try {
        const result=await completeProviderCheckout(id);
        if(!active)return;
        if(result.success) {
          finished=true;clearInterval(timer);setStatus("checkoutVerified");
          window.dispatchEvent(new Event("payment-verified"));
          router.refresh();
        } else {
          setStatus(result.code);
          if(["INVALID_STATE","NOT_FOUND","FORBIDDEN","UNAUTHORIZED","ENVIRONMENT_MISMATCH","CHECKOUT_MISMATCH","VALIDATION_ERROR"].includes(result.code)) {finished=true;clearInterval(timer);}
        }
      } catch {if(active)setStatus("CHECKOUT_PROVIDER_ERROR");}
      finally {checking=false;if(active)setBusy(false);}
    };
    const timer=setInterval(()=>void verify(),3000);
    verifyNow.current=verify;
    const initial=setTimeout(()=>void verify(),0);
    return()=>{active=false;clearTimeout(initial);clearInterval(timer);verifyNow.current=null;};
  },[id,open,router]);
  const close=()=>{setOpen(false);onClose?.();router.replace(pathname,{scroll:false});router.refresh();};
  return <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="payment-verification-title" aria-describedby="payment-verification-description">
    <DialogTitle id="payment-verification-title">{t(succeeded?"paymentSuccessTitle":terminal?"paymentVerificationIssue":"paymentVerificationPending")}</DialogTitle>
    <DialogContent className="payment-verification-content">
      {succeeded?<FiCheckCircle className="payment-success-icon" aria-hidden="true"/>:!terminal&&<CircularProgress aria-label={t("paymentVerificationPending")}/>}
      <div role={terminal?"alert":"status"} aria-live="polite"><p id="payment-verification-description">{t(status)}</p>{!succeeded&&!terminal&&<p>{t("paymentVerificationPolling")}</p>}</div>
    </DialogContent>
    <DialogActions>
      {!succeeded&&!terminal&&<Button disabled={busy} onClick={()=>void verifyNow.current?.()}>{t("verifyPayment")}</Button>}
      <Button variant="contained" onClick={close}>{t("close")}</Button>
    </DialogActions>
  </Dialog>;
}

export function HostedCheckout({plan,requestId}:{plan?:Row;requestId?:string}) {
  const {t,locale}=useApp();
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
    const load=requestId ? topupOptions({requestId}) : checkoutOptions({plan:planId,cycle:"monthly",extraSeats});
    void load.then(r=>{if(!active)return;if(r.success){setQuote(r.data);setError("");if("provider" in r.data) setProvider(r.data.provider as Provider);else setProvider(current=>r.data.providers[current]?current:r.data.providers.STRIPE?"STRIPE":r.data.providers.PAYPAL?"PAYPAL":"STRIPE")}else{setQuote(null);setError(resultMessage(r))}}).catch(()=>{if(active)setError("CHECKOUT_PROVIDER_ERROR")});
    return()=>{active=false};
  },[requestId,planId,extraSeats,reload]);
  const start=async()=>{
    if(!quote || !consent || busy)return;
    const environment = quote.environment;
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
    {quote && <p role="status">{t(quote.environment === "sandbox" ? "sandboxCheckoutHelp" : "liveCheckoutHelp")}</p>}
    {planId==="family-pro" && <label>{t("additionalProStudents")}<GuidedInput name="extraSeats" type="number" min={0} max={100} value={extraSeats} disabled={busy || !!checkout} onChange={e=>{setExtraSeats(Math.min(100,Math.max(0,Math.trunc(Number(e.target.value)||0))));setQuote(null);setConsent(false)}} /></label>}
    {!requestId && <div className="provider-options" role="radiogroup" aria-label={t("choosePaymentMethod")}>{(["UNIONPAY","STRIPE","PAYPAL"] as const).map(p=><button type="button" role="radio" aria-checked={provider===p} key={p} className={`provider-option ${provider===p?"selected":""}`} disabled={busy || !!checkout || !quote?.providers[p]} onClick={()=>{setProvider(p);setConsent(false)}}><PaymentLogo method={p}/><strong>{providerNames[p]}</strong><small>{t(p==="STRIPE"?"stripeFullCheckout":p==="UNIONPAY"?"unionpayViaStripe":"paypalCheckout")}</small></button>)}</div>}
    {requestId && <h3><PaymentLogo method={provider}/> {providerNames[provider]}</h3>}
    {provider!=="PAYPAL" && <p className="muted"><PaymentLogo method="STRIPE"/> {t("poweredByStripe")}</p>}
    {quote && <p className="checkout-total"><strong>{formatMoney(quote.amount,quote.currency,locale)}</strong> {plan?t("perMonth"):""}<small>{t("providerCurrencyNote")}</small></p>}
    <p>{t(plan?"recurringConsentHelp":"liveTopupHelp")}</p>
    {checkout ? <><a className="text-link" href={checkout.url} target="_blank" rel="noreferrer">{t("reopenCheckout")}</a><PaymentVerification id={checkout.id} onClose={()=>setCheckout(null)}/></> : <>
      <label className="checkbox-row"><GuidedInput help="help.field.consent" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t(plan?"authorizeSubscription":"authorizePayment")}</label>
      {quote && !quote.providers[provider] && <p role="status">{t("CHECKOUT_NOT_CONFIGURED")}</p>}
      <button type="button" className="button full" disabled={busy || !quote?.providers[provider] || !consent} onClick={()=>void start()}>{t(busy?"loading":"continueSecureCheckout")}</button>
      <button type="button" className="text-link" disabled={busy} onClick={()=>{setQuote(null);setReload(v=>v+1)}}>{t("refreshCheckout")}</button>
    </>}
    {error && <p role="alert" className="checkout-error">{t(error)}</p>}
  </div>;
}
