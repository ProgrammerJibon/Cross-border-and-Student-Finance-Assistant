"use client";
import { useState } from "react";
import Link from "next/link";
import { Slider } from "@mui/material";
import { FiPlus, FiBookOpen, FiArrowRight } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Metric,
  Progress,
  FormDialog,
  SectionTitle,
  Badge,
} from "@/components/ui/primitives";
import { FinanceLine } from "@/components/charts/finance-charts";
import { currencyOptions } from "@/components/accounts/money-page";
import { saveTuition, saveFundingPlan } from "@/actions/tuition.actions";
import { createReminder } from "@/actions/alert.actions";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
export function TuitionPage({ data }: { data: Workspace }) {
  const { t, locale, run } = useApp();
  const [editing, setEditing] = useState<Row | null>(null);
  const [scenario, setScenario] = useState({
    monthlySavings: 0,
    partTimeIncome: 0,
    fxMovement: 0,
    expenseReduction: 0,
  });
  const gap = data.gap;
  const extra =
    (scenario.monthlySavings +
      scenario.partTimeIncome +
      scenario.expenseReduction) *
    (gap?.months || 1);
  const projected = Number(gap?.projected || 0) + extra;
  const required = Number(gap?.required || 0) * (1 + scenario.fxMovement / 100);
  const fmt = (n: number | string, c = gap?.currency || "CNY") =>
    formatMoney(n, c, locale);
  return (
    <>
      <Heading
        title={t("tuition")}
        subtitle={t("fundingPlanner")}
        action={
          <button
            className="button"
            onClick={() =>
              setEditing({
                name: "",
                amount: "8000",
                paid: "0",
                scholarship: "0",
                currency: data.user.preferred_currency,
                due_date: new Date(Date.now() + 86400000 * 60)
                  .toISOString()
                  .slice(0, 10),
                semester: "",
              })
            }
          >
            <FiPlus />
            {t("addTuition")}
          </button>
        }
      />
      <div className="metrics-grid">
        <Metric
          label={t("tuitionReadiness")}
          value={`${Math.round(gap?.readiness || 0)}%`}
        />
        <Metric label={t("available")} value={fmt(gap?.available || 0)} />
        <Metric label={t("fundingGap")} value={fmt(gap?.shortage || 0)} />
        <Metric
          label={t("monthlyTarget")}
          value={fmt(gap?.monthlyTarget || 0)}
        />
      </div>
      <div className="two-grid">
        {data.tuition.map((i) => (
          <Card className="invoice-card" key={String(i.id)}>
            <div className="between">
              <span className="university-icon">
                <FiBookOpen />
              </span>
              <Badge>{i.semester}</Badge>
            </div>
            <h2>{i.name}</h2>
            <p className="muted">
              {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
                new Date(String(i.due_date)),
              )}
            </p>
            <strong className="metric-value">
              {fmt(String(i.amount), String(i.currency))}
            </strong>
            <div className="detail-list">
              <div>
                <span>{t("paid")}</span>
                <strong>{fmt(String(i.paid), String(i.currency))}</strong>
              </div>
              <div>
                <span>{t("scholarship")}</span>
                <strong>
                  {fmt(String(i.scholarship), String(i.currency))}
                </strong>
              </div>
            </div>
            <Progress
              value={
                ((Number(i.paid) + Number(i.scholarship)) / Number(i.amount)) *
                100
              }
            />
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => setEditing(i)}
              >
                {t("edit")}
              </button>
              <Link
                className="button"
                href={`/${locale}/transfer?invoice=${i.id}&amount=${Math.max(0.01, Number(i.amount) - Number(i.paid))}`}
              >
                {t("markPayment")}
                <FiArrowRight />
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {gap && (
        <Card>
          <SectionTitle title={t("fundingPlanner")} />
          <p className="muted">{t("plannerHelp")}</p>
          <div className="planner-grid">
            <div>
              {Object.entries(scenario).map(([key, value]) => (
                <div className="slider-field" key={key}>
                  <div className="between">
                    <label id={`slider-${key}`}>{t(key)}</label>
                    <strong>
                      {key === "fxMovement" ? `${value}%` : fmt(value)}
                    </strong>
                  </div>
                  <Slider
                    value={value}
                    aria-labelledby={`slider-${key}`}
                    min={key === "fxMovement" ? -20 : 0}
                    max={key === "fxMovement" ? 20 : 2000}
                    step={key === "fxMovement" ? 1 : 25}
                    onChange={(_, n) =>
                      setScenario({ ...scenario, [key]: n as number })
                    }
                  />
                </div>
              ))}
            </div>
            <div>
              <FinanceLine
                labels={Array.from(
                  { length: gap.months + 1 },
                  (_, i) => `${i}`,
                )}
                series={[
                  {
                    label: "projected",
                    data: Array.from(
                      { length: gap.months + 1 },
                      (_, i) =>
                        Number(gap.available) +
                        ((projected - Number(gap.available)) * i) / gap.months,
                    ),
                  },
                  {
                    label: "tuition",
                    data: Array(gap.months + 1).fill(required),
                  },
                ]}
              />
              <div className="between">
                <span>{t("fundingGap")}</span>
                <strong>{fmt(Math.max(0, required - projected))}</strong>
              </div>
            </div>
          </div>
          <div className="button-group">
            <button
              className="button"
              onClick={() =>
                run(() =>
                  saveFundingPlan({
                    invoice_id: gap.id,
                    monthly_target: String(
                      Math.max(
                        0.01,
                        (required - projected) / gap.months,
                      ).toFixed(2),
                    ),
                    scenario,
                  }),
                )
              }
            >
              {t("savePlan")}
            </button>
            <button
              className="button secondary"
              onClick={() => run(() => createReminder("tuitionApproaching"))}
            >
              {t("setReminder")}
            </button>
          </div>
        </Card>
      )}
      {editing && (
        <FormDialog
          title="tuition"
          fields={[
            { name: "name", label: "university" },
            { name: "amount", type: "number", min: 0.01 },
            { name: "currency", options: currencyOptions },
            { name: "due_date", type: "date" },
            { name: "paid", type: "number", min: 0 },
            { name: "scholarship", type: "number", min: 0 },
            { name: "semester" },
          ]}
          initial={Object.fromEntries(
            Object.entries(editing).map(([k, v]) => [k, String(v ?? "")]),
          )}
          submit={(v) => saveTuition({ ...editing, ...v })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
