"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/ui/providers";
import { Card } from "@/components/ui/primitives";
import { getGatewaySettings, saveGatewaySettings } from "@/actions/gateway.actions";
export function GatewaySettings() {
  const { t, run } = useApp();
  const [environment,setEnvironment] = useState<"sandbox"|"live">("sandbox");
  const [configured,setConfigured] = useState<Record<string,boolean>>({});
  const [busy,setBusy] = useState(false);
  const [version,setVersion] = useState(0);
  useEffect(() => { let active=true; void getGatewaySettings(environment).then(r => {if(active && r.success) setConfigured(r.data)}); return () => {active=false}; },[environment,version]);
  return <Card><h2>{t("gatewaySettings")}</h2><p>{t("gatewaySecretHelp")}</p>
    <div className="button-group">{(["sandbox","live"] as const).map(mode => <button key={mode} className={`button ${mode===environment?"":"secondary"}`} aria-pressed={mode===environment} onClick={() => {setEnvironment(mode);setConfigured({})}}>{t(mode)}</button>)}</div>
    <form key={environment} onSubmit={async e => {e.preventDefault(); const form=e.currentTarget;setBusy(true); const result=await run(() => saveGatewaySettings({...Object.fromEntries(new FormData(form)),environment}));setBusy(false);if(result!==undefined){form.reset();setVersion(v=>v+1)}}}>
      <div className="two-grid">{["stripeSecret","stripeWebhookSecret","paypalClientId","paypalSecret","paypalWebhookId",...(environment === "sandbox" ? ["buyerEmail","buyerPassword"] : [])].map(key => <label key={key}>{t(key)}<input name={key} type="password" autoComplete="new-password" placeholder={t(configured[key]?"keyStored":"notConfigured")} /></label>)}</div>
      <button className="button" disabled={busy}>{t("save")}</button>
    </form>
  </Card>;
}
