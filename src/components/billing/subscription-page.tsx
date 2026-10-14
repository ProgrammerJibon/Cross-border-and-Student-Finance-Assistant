"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FiCheck, FiCreditCard, FiShield } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Badge,
  Progress,
  FormFields,
  DataCards,
  Status,
} from "@/components/ui/primitives";
import {
  purchasePlan,
  cancelSubscription,
} from "@/actions/subscription.actions";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
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
          <h2>{t(String(p.name))}</h2>
          <p>{t(String(p.description_key))}</p>
          <div className="plan-price">
            {formatMoney(String(p.monthly), String(p.currency), locale)}
            <small>{t("perMonth")}</small>
          </div>
          <ul>
            {Object.entries(
              JSON.parse(String(p.limits)) as Record<string, number>,
            ).map(([k, v]) => (
              <li key={k}>
                <FiCheck />
                <span>{t(k)}</span>
                <b>{v}</b>
              </li>
            ))}
          </ul>
          <Link
            className={`button full ${p.recommended ? "" : "secondary"}`}
            href={`/${locale}/${publicPage || p.id === "trial" ? "register" : `subscription/checkout?plan=${p.id}`}`}
          >
            {t(p.id === "trial" ? "startTrial" : "upgrade")}
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
    data.plans.find((p) => p.id === "student")!;
  const [form, setForm] = useState<Record<string, string>>({
    cardholder: data.user.name,
    card: "",
    expiry: "",
    cvv: "",
  });
  const [busy, setBusy] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [savedCardId, setSavedCardId] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [result, setResult] = useState<{
    status: string;
    reference: string;
  } | null>(null);
  const sub = data.subscription[0];
  const limits = sub
    ? (JSON.parse(String(sub.limits)) as Record<string, number>)
    : {};
  if (checkout)
    return (
      <>
        <Heading title={t("checkout")} subtitle={t("paymentNote")} />
        <div className="checkout-grid">
          <Card>
            <Badge>{t("sandbox")}</Badge>
            <h2>{t(String(plan.name))}</h2>
            <p>{t(String(plan.description_key))}</p>
            <strong className="metric-value">
              {formatMoney(String(plan[cycle]), String(plan.currency), locale)}
            </strong>
            <p>{t(cycle === "yearly" ? "perYear" : "perMonth")}</p>
            <label>
              {t("billingCycle")}
              <select
                aria-label={t("billingCycle")}
                value={cycle}
                onChange={(e) =>
                  setCycle(e.target.value as "monthly" | "yearly")
                }
              >
                <option value="monthly">{t("monthly")}</option>
                <option value="yearly">{t("yearly")}</option>
              </select>
            </label>
            <div className="checkout-card-art">
              <FiCreditCard size={35} />
              <span>•••• •••• •••• 4242</span>
              <strong>{t("sandbox")}</strong>
            </div>
          </Card>
          <Card>
            <h2>{t("checkout")}</h2>
            <button
              className="text-link"
              onClick={() =>
                setForm({
                  ...form,
                  card: "4242424242424242",
                  expiry: "12/29",
                  cvv: "123",
                })
              }
            >
              {t("useDemoCard")}
            </button>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const r = await run(
                  () =>
                    purchasePlan({
                      ...form,
                      plan: plan.id,
                      saveCard,
                      cycle,
                      savedCardId: savedCardId || undefined,
                    }),
                  { quiet: true },
                );
                if (r) setResult(r);
                setBusy(false);
              }}
            >
              <label className="model-select">
                {t("savedCards")}
                <select
                  value={savedCardId}
                  onChange={(e) => setSavedCardId(e.target.value)}
                >
                  <option value="">{t("newCard")}</option>
                  {data.savedCards.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.label} · •••• {c.last_four} · {c.expiry}
                    </option>
                  ))}
                </select>
              </label>
              {!savedCardId && (
                <FormFields
                  fields={[
                    { name: "cardholder" },
                    { name: "card" },
                    { name: "expiry" },
                    { name: "cvv", type: "password" },
                  ]}
                  values={form}
                  setValues={setForm}
                />
              )}
              {!savedCardId && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={saveCard}
                    onChange={(e) => setSaveCard(e.target.checked)}
                  />
                  {t("saveCard")}
                </label>
              )}
              <p className="muted">
                <FiShield />
                {t("paymentNote")}
              </p>
              <button className="button full" disabled={busy}>
                {t(busy ? "loading" : "pay")}
              </button>
            </form>
            {result && (
              <div className="risk-panel">
                <Status value={result.status} />
                <p>{result.reference}</p>
                <Link className="text-link" href={`/${locale}/subscription`}>
                  {t("subscription")}
                </Link>
              </div>
            )}
          </Card>
        </div>
      </>
    );
  return (
    <>
      <Heading title={t("subscription")} subtitle={t("planPro")} />
      <Card>
        <div className="between">
          <div>
            <Badge>{t("currentPlan")}</Badge>
            <h2>{t(String(sub?.name || "Free Trial"))}</h2>
            <p className="muted">
              {t("billingCycle")} ·{" "}
              {sub?.ends_at
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
        <button
          className="text-link danger-text"
          onClick={() => run(cancelSubscription)}
        >
          {t("cancelSubscription")}
        </button>
      </Card>
      <Plans plans={data.plans} />
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
