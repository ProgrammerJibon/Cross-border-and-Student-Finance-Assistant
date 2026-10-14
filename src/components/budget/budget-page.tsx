"use client";
import { useState } from "react";
import Link from "next/link";
import { FiPlus, FiEdit2, FiZap } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Metric,
  Progress,
  FormDialog,
  SectionTitle,
} from "@/components/ui/primitives";
import { FinanceBar, FinanceGauge } from "@/components/charts/finance-charts";
import {
  categoryOptions,
  currencyOptions,
} from "@/components/accounts/money-page";
import { saveBudget } from "@/actions/budget.actions";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
export function BudgetPage({ data }: { data: Workspace }) {
  const { t, locale } = useApp();
  const [editing, setEditing] = useState<Row | null>(null);
  const total = Number(data.metrics.budget),
    spent = Number(data.metrics.spending);
  const fmt = (n: number) =>
    formatMoney(n, data.user.preferred_currency, locale);
  return (
    <>
      <Heading
        title={t("budget")}
        subtitle={t("plannerHelp")}
        action={
          <button
            className="button"
            onClick={() =>
              setEditing({
                category: "Food",
                amount: "300",
                currency: data.user.preferred_currency,
                month: new Date().toISOString().slice(0, 7),
              })
            }
          >
            <FiPlus />
            {t("createBudget")}
          </button>
        }
      />
      <div className="metrics-grid">
        <Metric label={t("budget")} value={fmt(total)} />
        <Metric label={t("actual")} value={fmt(spent)} />
        <Metric label={t("remaining")} value={fmt(total - spent)} />
        <Metric
          label={t("projected")}
          value={fmt(
            (spent / Math.max(1, new Date().getDate())) *
              new Date(
                new Date().getFullYear(),
                new Date().getMonth() + 1,
                0,
              ).getDate(),
          )}
        />
      </div>
      <div className="two-grid">
        <Card>
          <SectionTitle title={t("budgetActual")} />
          <FinanceBar
            currency={data.user.preferred_currency}
            labels={data.budgets.map(
              (b) => `${t(String(b.category))} (${b.currency})`,
            )}
            series={[
              {
                label: "budget",
                data: data.budgets.map(
                  (b) =>
                    (Number(b.amount) /
                      Number(data.rates[String(b.currency)])) *
                    Number(data.rates[data.user.preferred_currency]),
                ),
              },
              {
                label: "actual",
                data: data.budgets.map(
                  (b) =>
                    (Number(b.actual) /
                      Number(data.rates[String(b.currency)])) *
                    Number(data.rates[data.user.preferred_currency]),
                ),
              },
            ]}
          />
        </Card>
        <Card className="budget-gauge">
          <FinanceGauge
            value={total ? Math.min(100, (spent / total) * 100) : 0}
          />
          <h3>{t("utilization")}</h3>
          <p>
            {fmt(spent)} / {fmt(total)}
          </p>
          <Link className="text-link" href={`/${locale}/agent`}>
            <FiZap />
            {t("promptBudget")}
          </Link>
        </Card>
      </div>
      <div className="three-grid">
        {data.budgets.map((b) => (
          <Card key={String(b.id)}>
            <div className="between">
              <h3>{t(String(b.category))}</h3>
              <button
                className="icon-button"
                aria-label={t("edit")}
                onClick={() => setEditing(b)}
              >
                <FiEdit2 />
              </button>
            </div>
            <div className="budget-amount">
              <strong>
                {formatMoney(String(b.actual), String(b.currency), locale)}
              </strong>
              <span>
                {" "}
                / {formatMoney(String(b.amount), String(b.currency), locale)}
              </span>
            </div>
            <Progress
              value={
                (Number(b.actual) /
                  Number(b.amount) /
                  Number(data.rates[String(b.currency)])) *
                Number(data.rates[data.user.preferred_currency]) *
                100
              }
              color={
                Number(b.actual) > Number(b.amount) ? "#cb7958" : undefined
              }
            />
            <p
              className={
                Number(b.actual) > Number(b.amount) ? "warning-text" : "muted"
              }
            >
              {t(
                Number(b.actual) > Number(b.amount)
                  ? "overBudget"
                  : "remaining",
              )}{" "}
              ·{" "}
              {formatMoney(
                Math.abs(
                  Number(b.amount) -
                    (Number(b.actual) /
                      Number(data.rates[String(b.currency)])) *
                      Number(data.rates[data.user.preferred_currency]),
                ),
                String(b.currency),
                locale,
              )}
            </p>
          </Card>
        ))}
      </div>
      {editing && (
        <FormDialog
          title="budget"
          fields={[
            { name: "category", options: categoryOptions },
            { name: "amount", type: "number", min: 0.01 },
            { name: "currency", options: currencyOptions },
            { name: "month", type: "month" },
          ]}
          initial={Object.fromEntries(
            Object.entries(editing).map(([k, v]) => [k, String(v ?? "")]),
          )}
          submit={(v) => saveBudget({ ...editing, ...v })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
