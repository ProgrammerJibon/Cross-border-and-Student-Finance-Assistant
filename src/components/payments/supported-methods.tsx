"use client";
import { useApp } from "@/components/ui/providers";
import { PaymentLogo } from "./payment-logo";

export function SupportedPaymentMethods() {
  const { t } = useApp();
  return (
    <section
      className="supported-payments"
      aria-label={t("supportedPaymentMethods")}
    >
      <div>
        <strong>{t("supportedPaymentMethods")}</strong>
      </div>
      <ul aria-label={t("supportedPaymentMethods")}>
        {["UnionPay", "Stripe", "Alipay", "WeChat Pay", "PayPal", "Visa", "Mastercard"].map((method) => (
          <li key={method} className="payment-wordmark">
            <span role="img" aria-label={method}>
              <PaymentLogo method={method} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
