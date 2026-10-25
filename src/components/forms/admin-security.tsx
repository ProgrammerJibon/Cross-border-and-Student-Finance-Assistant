"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card,FormFields } from "@/components/ui/primitives";
import { useApp } from "@/components/ui/providers";
import { rotateBootstrapPassword,enrollMfa,confirmMfa } from "@/actions/security.actions";
export function AdminSecurity({rotate}:{rotate:boolean}) {
  const {t,run,locale}=useApp(),router=useRouter();
  const [form,setForm]=useState<Record<string,string>>({}),[secret,setSecret]=useState(""),[busy,setBusy]=useState(false);
  return <Card><h1>{t("adminSecuritySetup")}</h1><p>{t("adminSecurityHelp")}</p>
    {rotate?<form onSubmit={async e=>{e.preventDefault();setBusy(true);const result=await run(()=>rotateBootstrapPassword({current:form.current,password:form.password}));if(result!==undefined)router.refresh();setBusy(false);}}>
      <FormFields fields={[{name:"current",label:"currentPassword",type:"password"},{name:"password",label:"newPassword",type:"password"}]} values={form} setValues={setForm}/><button className="button" disabled={busy}>{t("changePassword")}</button>
    </form>:<>
      <button className="button" disabled={busy} onClick={async()=>{setBusy(true);const r=await run(()=>enrollMfa());if(r)setSecret(r.secret);setBusy(false);}}>{t("enrollMfa")}</button>
      {secret&&<><p>{t("totpSetupHelp")}</p><code>{secret}</code><form onSubmit={async e=>{e.preventDefault();setBusy(true);const r=await run(()=>confirmMfa(form.code));if(r!==undefined){setSecret("");router.push(`/${locale}/login`);}setBusy(false);}}><FormFields fields={[{name:"code",label:"mfaCode"}]} values={form} setValues={setForm}/><button className="button" disabled={busy}>{t("confirm")}</button></form></>}
    </>}
  </Card>;
}
