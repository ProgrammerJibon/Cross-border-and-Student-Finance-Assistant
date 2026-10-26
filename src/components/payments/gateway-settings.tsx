"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/ui/providers";
import { Card, FormFields } from "@/components/ui/primitives";
import { getGatewayOverview, getGatewaySettings, saveGatewaySettings, testGatewaySettings } from "@/actions/gateway.actions";
export function GatewaySettings({demo=false}:{demo?:boolean}) {
  const { t, run } = useApp();
  const [environment,setEnvironment] = useState<"sandbox"|"live">("sandbox");
  const [configured,setConfigured] = useState<Record<string,boolean>>({});
  const [values,setValues] = useState<Record<string,string>>({});
  const [status,setStatus] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [version,setVersion] = useState(0);
  const [overview,setOverview] = useState<{provider:string;environment:string;webhookConfigured:boolean}[]|null>(null);
  const [error,setError] = useState("");
  useEffect(() => { let active=true; void getGatewayOverview().then(r=>{if(active){if(r.success)setOverview(r.data);else setError(r.code);}}).catch(()=>{if(active)setError("NETWORK_ERROR");});return()=>{active=false};},[version]);
  useEffect(() => { if(demo)return;let active=true; void getGatewaySettings(environment).then(r => {if(active){if(r.success)setConfigured(r.data);else setError(r.code);}}).catch(()=>{if(active)setError("NETWORK_ERROR");}); return () => {active=false}; },[demo,environment,version]);
  return <Card><h2>{t("gatewaySettings")}</h2><p>{t(demo?"gatewayReadOnlyHelp":"gatewaySecretHelp")}</p>
    {error&&<p role="alert">{t(error)}</p>}
    <div className="configured-gateways">
      {overview===null?<p>{t("loading")}</p>:overview.length?overview.map(g=><div key={`${g.environment}-${g.provider}`} className="configured-gateway"><strong>{g.provider === "STRIPE" ? "Stripe" : "PayPal"}</strong><span className="badge">{t(g.environment)}</span><span>{t("credentialsAdded")}</span><small>{t(g.webhookConfigured?"webhookConfigured":"webhookMissing")}</small></div>):<p>{t("noConfiguredGateways")}</p>}
    </div>
    <p role="status">{t("gatewayUntested")}</p>
    {!demo&&<>
    <div className="button-group">{(["sandbox","live"] as const).map(mode => <button key={mode} className={`button ${mode===environment?"":"secondary"}`} aria-pressed={mode===environment} onClick={() => {setEnvironment(mode);setConfigured({});setStatus({});setValues({})}}>{t(mode)}</button>)}</div>
    <form key={environment} onSubmit={async e => {e.preventDefault();setBusy(true); const result=await run(() => saveGatewaySettings({...values,environment}));setBusy(false);if(result!==undefined){setValues({});setStatus({});setVersion(v=>v+1)}}}>
      <FormFields fields={["stripePublishableKey","stripeSecret","stripeWebhookSecret","paypalClientId","paypalSecret","paypalWebhookId"].map(name=>({name,type:"password",required:false,help:configured[name]?"keyStored":"notConfigured"}))} values={values} setValues={setValues}/>
      <button className="button" disabled={busy}>{t("save")}</button>
    </form>
    <button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);const r=await run(()=>testGatewaySettings(environment),{quiet:true,refresh:false});if(r)setStatus(r);setBusy(false);}}>{t("testGatewaySettings")}</button>
    <p>{t("gatewayWebhookHelp")}</p>
    {Object.entries(status).map(([key,value])=><p key={key} role="status"><strong>{key}</strong>: {value}</p>)}
    </>}
  </Card>;
}
