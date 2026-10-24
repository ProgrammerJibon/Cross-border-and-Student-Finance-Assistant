"use client";
import { useApp } from "@/components/ui/providers";
import { FiShield } from "react-icons/fi";
import { PaymentLogo } from "./payment-logo";

export function SupportedPaymentMethods() {
  const { t } = useApp();
  return (
    <section
      className="supported-payments"
      aria-label={t("supportedPaymentMethods")}
    >
      <div>
        <FiShield />
        <strong>{t("supportedPaymentMethods")}</strong>
      </div>
      <ul aria-label={t("supportedPaymentMethods")}>
        {["UnionPay", "Stripe", "Alipay", "WeChat Pay", "PayPal", "Visa", "Mastercard"].map((method) => (
          <li key={method} className="payment-wordmark">
            <PaymentLogo method={method} />
            <span>{method}</span>
          </li>
        ))}
      </ul>
      <p>{t("supportedPaymentNote")}</p>
    </section>
  );
}
