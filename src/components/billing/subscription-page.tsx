"use client";
import { familyPlans } from "@/lib/plan-policy";
import { simulateSubscription } from "@/actions/demo.actions";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FiCheck, FiLock } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Badge,
  Progress,
  DataCards,
  Status,
} from "@/components/ui/primitives";
import { cancelSubscription } from "@/actions/subscription.actions";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { ProviderCheckout, ProviderPaymentHistory } from "./provider-checkout";
import { parseJson } from "@/lib/json";
import { PlanIcon } from "./plan-icon";
export function Plans({
  plans,
  publicPage = false,
}: {
  plans: Row[];
  publicPage?: boolean;
}) {
  const { t, locale } = useApp();
  return (
    <div className="plans-grid">
      {plans.map((p) => (
        <Card
          key={String(p.id)}
          className={`plan-card ${p.recommended ? "plan-recommended" : ""}`}
        >
          {!!p.recommended && <Badge>{t("recommended")}</Badge>}
          <h2 className="plan-heading-with-icon">
            <PlanIcon planId={String(p.id)} size={26} aria-hidden="true" />
            <span>{t(String(p.name))}</span>
          </h2>
          <p>{t(String(p.description_key))}</p>
          <div className="plan-price">
            {formatMoney(String(p.monthly), String(p.currency), locale)}
            <small>{t("perMonth")}</small>
          </div>
          {p.monthly_rmb != null && <p className="muted">{t("approximateRmb")} {formatMoney(String(p.monthly_rmb), "CNY", locale)} {t("perMonth")}</p>}
          <ul className="plan-features">{(p.id === "student-free" ? ["freeSharedAi", "freeSidebar", "freeBeneficiaries", "freeWallets", "freeBudgets", "freeChats"] : p.id === "student" ? ["proAllFeatures", "proSharedAi"] : p.id === "family" ? ["liteProSeats", "liteFreeSeats", "familyControls"] : ["familyProSeats", "familyFreeSeats", "familyControls", "familyExtraSeats"]).map(key => <li key={key}><FiCheck /><span>{t(key)}</span></li>)}</ul>
          {p.id === "family-pro" && <p>{t("extraSeatPrice")} {formatMoney("256", "BDT", locale)} / {t("perMonth")} ({t("approximateRmb")} {formatMoney(String(p.extra_rmb || "0"), "CNY", locale)})</p>}
          <details open className="plan-quotas"><summary>{t("planQuotas")}</summary><ul>
            {Object.entries(
              parseJson<Record<string, number>>(p.limits, {}),
            ).map(([k, v]) => (
              <li key={k}>
                {v > 0 ? <FiCheck /> : <FiLock />}
                <span>{t(k)}</span>
                <b>{v}</b>
              </li>
            ))}
          </ul></details>
          <Link
            className={`button full ${p.recommended ? "" : "secondary"}`}
            href={`/${locale}/${publicPage || p.id === "trial" ? "register" : `subscription/checkout?plan=${p.id}`}`}
          >
            {t(
              p.id === "student-free"
                ? "chooseFree"
                : p.id === "trial"
                  ? "startTrial"
                  : "upgrade",
            )}
          </Link>
        </Card>
      ))}
    </div>
  );
}
export function SubscriptionPage({
  data,
  checkout = false,
}: {
  data: Workspace;
  checkout?: boolean;
}) {
  const { t, locale, run } = useApp();
  const params = useSearchParams();
  const plan =
    data.plans.find((p) => p.id === params.get("plan")) ||
    data.plans.find(
      (p) => p.id === (data.user.role === "PARENT" ? "family" : "student"),
    )!;
  const sub = data.subscription[0];
  const locked = !!data.user.is_demo || !!sub?.sponsored_by;
  const availablePlans = data.plans.filter((p) =>
    data.user.role === "PARENT"
      ? familyPlans.includes(String(p.id))
      : ["student-free", "student"].includes(String(p.id)),
  );
  const limits = sub ? parseJson<Record<string, number>>(sub.limits, {}) : {};
  if (checkout && !locked && availablePlans.some((p) => p.id === plan?.id))
    return (
      <ProviderCheckout
        key={`${plan?.id}-${params.get("checkout") || ""}-${params.get("cycle") || ""}`}
        plan={plan}
      />
    );
  return (
    <>
      <Heading
        title={t("subscription")}
        subtitle={t(
          data.user.is_demo
            ? "demoPlanLocked"
            : sub?.sponsored_by
              ? "familyIncluded"
              : data.user.role === "PARENT"
                ? "familyPurchaseRequired"
                : "studentUpgradeHelp",
        )}
      />
      {!!data.user.is_demo && <Card><p>{t("demoEnvironmentNotice")}</p><div className="button-group">{availablePlans.map(p=><button key={String(p.id)} className="button secondary" onClick={()=>run(()=>simulateSubscription({id:crypto.randomUUID(),plan:p.id}),{refresh:true})}>{t("simulateSubscription")} · {t(String(p.name))}</button>)}</div></Card>}
      <Card>
        <div className="between">
          <div>
            <Badge>{t("currentPlan")}</Badge>
            <h2>{t(String(sub?.name || "familyPurchaseRequired"))}</h2>
            <p className="muted">
              {t("billingCycle")} ·{" "}
              {sub?.plan_id === "student-free"
                ? t("freeForever")
                : sub?.ends_at
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeZone: data.user.timezone,
                    }).format(
                      new Date(String(sub.ends_at).replace(" ", "T") + "Z"),
                    )
                  : "—"}
            </p>
          </div>
          <Status value={String(sub?.status || "PENDING")} />
        </div>
        <div className="three-grid quotas">
          {Object.entries(limits).map(([key, limit]) => {
            const used =
              key === "ACCOUNTS"
                ? data.accounts.length
                : key === "PARENT_LINKS"
                  ? data.family.filter((f) => f.status !== "REVOKED").length
                  : Number(
                      data.usage.find((u) => u.feature === key)?.used || 0,
                    );
            return (
              <div key={key}>
                <div className="between">
                  <span>{t(key)}</span>
                  <b>
                    {used} / {limit}
                  </b>
                </div>
                <Progress value={limit ? (used / limit) * 100 : 100} />
              </div>
            );
          })}
        </div>
        {!locked &&
          sub?.plan_id !== "student-free" && (
            <button
              className="text-link danger-text"
              onClick={() => run(cancelSubscription)}
            >
              {t("cancelSubscription")}
            </button>
          )}
      </Card>
      {!locked && <Plans plans={availablePlans} />}
      <ProviderPaymentHistory />
      <Card>
        <h2>{t("subscriptionHistory")}</h2>
        <DataCards
          rows={data.subscriptionHistory}
          columns={[
            { key: "plan_id", label: "plan" },
            { key: "action" },
            { key: "cycle", label: "billingCycle" },
            { key: "created_at", label: "date" },
          ]}
        />
      </Card>
      <Card>
        <h2>{t("paymentHistory")}</h2>
        <DataCards
          rows={data.payments}
          columns={[
            { key: "reference" },
            { key: "created_at", label: "date" },
            {
              key: "amount",
              render: (r) =>
                formatMoney(String(r.amount), String(r.currency), locale),
            },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
          ]}
        />
      </Card>
    </>
  );
}
