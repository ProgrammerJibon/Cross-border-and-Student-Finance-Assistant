"use client";
import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";

export function DemoPaymentCard({ provider }: { provider: string }) {
  const { t } = useApp();
  const [details] = useState(() => ({
    expiry: `12/${String(new Date().getFullYear() + 3).slice(-2)}`,
    cvc: "123",
    cvv: "1234",
  }));
  const [copyStatus, setCopyStatus] = useState("");
  const paypal = provider === "PAYPAL";
  const number = paypal ? "3714 4963 5398 431" : "4242 4242 4242 4242";
  return <aside className="demo-payment-card" aria-label={t("demoCard")}>
    <strong>{paypal ? "PayPal" : "Stripe"} · {t("demoCard")}</strong>
    <div className="between">
      <code>{number}</code>
      <button className="button secondary small" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(number); setCopyStatus(number); }
        catch { setCopyStatus("copyFailed"); }
      }} aria-label={t("copyCardNumber")}>
        {copyStatus === number ? <FiCheck /> : <FiCopy />}{t(copyStatus === number ? "copied" : "copyCardNumber")}
      </button>
    </div>
    <div className="demo-card-details"><span>{t("expiryDate")}: <b>{details.expiry}</b></span><span>{paypal?"CVV":"CVC"}: <b>{paypal?details.cvv:details.cvc}</b></span></div>
    <p>{t(paypal?"paypalSandboxBuyerHelp":"stripeSandboxCardHelp")}</p>
    {copyStatus === "copyFailed" && <p role="status">{t("copyCardFallback")}</p>}
  </aside>;
}
