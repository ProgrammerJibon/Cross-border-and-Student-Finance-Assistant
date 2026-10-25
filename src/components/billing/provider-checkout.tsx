"use client";
import { resultMessage } from "@/lib/result-message";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/ui/providers";
import { Card, Heading, DataCards, Status } from "@/components/ui/primitives";
import { providerPaymentHistory } from "@/actions/checkout.actions";
import { activateStudentFree } from "@/actions/subscription.actions";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types";
import { HostedCheckout, PaymentVerification } from "./hosted-checkout";
export function ProviderCheckout({plan}:{plan:Row|undefined}) {
  const {t,locale,run}=useApp();const params=useSearchParams();
  const checkout=params.get("checkout");
  if(!plan)return <Card>{t("NOT_FOUND")}</Card>;
  return <><Heading title={t("checkout")} subtitle={t("providerCheckoutIntro")}/><div className="checkout-grid"><Card><h2>{t(String(plan.name))}</h2><p>{t(String(plan.description_key))}</p><strong className="metric-value">{formatMoney(String(plan.monthly),String(plan.currency),locale)}</strong><p>{t("perMonth")}</p>{plan.monthly_rmb!=null && <p>{t("approximateRmb")} {formatMoney(String(plan.monthly_rmb),"CNY",locale)}</p>}</Card><Card>{checkout?<PaymentVerification id={checkout}/>:plan.id==="student-free"?<><p>{t("freePlanNote")}</p><button className="button" onClick={()=>run(activateStudentFree)}>{t("chooseFree")}</button></>:<HostedCheckout plan={plan}/>}</Card></div></>;
}
export function ProviderPaymentHistory() {
  const { t, locale } = useApp();
  const [payments, setPayments] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void providerPaymentHistory()
      .then((r) => {
        if (active) {
          if (r.success) setPayments(r.data);
          else setError(resultMessage(r));
        }
      })
      .catch(() => {
        if (active) setError("CHECKOUT_PROVIDER_ERROR");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Card>
      <h2>{t("providerPaymentHistory")}</h2>
      {error && <p role="alert">{t(error)}</p>}
      <DataCards
        rows={payments}
        columns={[
          { key: "provider" },
          {
            key: "amount",
            render: (r) =>
              formatMoney(String(r.amount), String(r.currency), locale),
          },
          { key: "status", render: (r) => <Status value={String(r.status)} /> },
          { key: "reference" },
          {
            key: "id",
            label: "action",
            render: (r) =>
              r.status !== "COMPLETED" ? (
                <Link
                  className="text-link"
                  href={r.purpose === "TOPUP" ? `/${locale}/payments?checkout=${r.id}` : `/${locale}/subscription/checkout?plan=${r.plan_id}&cycle=${r.cycle}&checkout=${r.id}`}
                >
                  {t("verifyPayment")}
                </Link>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </Card>
  );
}
