"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Switch, FormControlLabel, Checkbox } from "@mui/material";
import {
  FiPlus,
  FiBell,
  FiShield,
  FiCheck,
  FiDownload,
  FiGlobe,
  FiArrowRight,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Heading,
  Card,
  Metric,
  FormFields,
  FormDialog,
  DataCards,
  Status,
  ExportButton,
  Empty,
  downloadJson,
} from "@/components/ui/primitives";
import {
  FinanceBar,
  FinanceGauge,
  FinanceLine,
} from "@/components/charts/finance-charts";
import { updateCredit, toggleCreditTask } from "@/actions/credit.actions";
import { updateAlert, createReminder } from "@/actions/alert.actions";
import { submitReport } from "@/actions/report.actions";
import { updatePreferences } from "@/actions/preferences.actions";
import {
  updateProfile,
  exportMyData,
  clearDemoData,
  closeAccount,
} from "@/actions/user.actions";
import { changePassword } from "@/actions/auth.actions";
import { formatMoney } from "@/lib/money";
import { currencyOptions } from "@/components/accounts/money-page";
import { TransferPage } from "@/components/transfers/transfer-page";
import type { Workspace } from "@/types/workspace";
import {
  ModelManager,
  SavedCards,
  IdentitySettings,
} from "@/components/settings/platform-panels";
export function WalletPage({ data }: { data: Workspace }) {
  const { t, locale, catalog } = useApp();
  const [historyCurrency, setHistoryCurrency] = useState("BDT");
  const history = data.rateHistory.filter(
    (r) => r.currency === historyCurrency,
  );
  return (
    <>
      <Heading title={t("wallet")} subtitle={t("ratesNote")} />
      <div className="metrics-grid">
        {data.accounts.map((a) => (
          <Metric
            key={String(a.id)}
            label={String(a.currency)}
            value={formatMoney(String(a.balance), String(a.currency), locale)}
            icon={<FiGlobe />}
            note={String(a.name)}
          />
        ))}
      </div>
      <div className="two-grid">
        <Card>
          <h2>{t("currencyExposure")}</h2>
          <FinanceBar
            labels={data.accounts.map((a) => String(a.currency))}
            series={[
              {
                label: "balance",
                data: data.accounts.map(
                  (a) =>
                    (Number(a.balance) /
                      Number(data.rates[String(a.currency)])) *
                    Number(data.rates.CNY),
                ),
              },
            ]}
          />
          <small className="muted">RMB</small>
        </Card>
        <Card>
          <h2>{t("rate")}</h2>
          <div className="detail-list rate-list">
            {Object.entries(data.rates)
              .sort(([a], [b]) =>
                a === "BDT"
                  ? -1
                  : b === "BDT"
                    ? 1
                    : a === "CNY"
                      ? -1
                      : b === "CNY"
                        ? 1
                        : a.localeCompare(b),
              )
              .map(([c, r]) => (
                <div key={c}>
                  <span>
                    1 RMB <FiArrowRight /> {c === "CNY" ? "RMB" : c}
                  </span>
                  <b>
                    {(Number(r) / Number(data.rates.CNY)).toLocaleString(
                      locale,
                      {
                        maximumFractionDigits: 6,
                      },
                    )}
                  </b>
                </div>
              ))}
          </div>
        </Card>
      </div>
      <Card>
        <div className="between wrap">
          <div>
            <h2>{t("fxHistory")}</h2>
            <p className="muted">{t("fxHistoryNote")}</p>
          </div>
          <label>
            {t("currency")}{" "}
            <select
              value={historyCurrency}
              onChange={(e) => setHistoryCurrency(e.target.value)}
              aria-label={t("fxHistory")}
            >
              {catalog.currencies
                .map((c) => ({ value: c.code, label: c.code }))
                .filter((c) => c.value !== "CNY")
                .map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {history.length ? (
          <FinanceLine
            labels={history.map((r) =>
              new Date(r.day + "T12:00:00Z").toLocaleDateString(locale, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }),
            )}
            series={[
              {
                label: `RMB → ${historyCurrency}`,
                data: history.map(
                  (r) =>
                    Number(r.rate) /
                    Number(
                      data.rateHistory.find(
                        (h) => h.currency === "CNY" && h.day === r.day,
                      )?.rate || data.rates.CNY,
                    ),
                ),
              },
            ]}
          />
        ) : (
          <Empty />
        )}
      </Card>
      <TransferPage data={data} conversion />
    </>
  );
}
export function CreditPage({ data }: { data: Workspace }) {
  const { t, run } = useApp();
  const profile = data.creditProfile[0] || {
    utilization: 0,
    age_months: 0,
    overdue: 0,
    on_time: 0,
  };
  const [editing, setEditing] = useState(false);
  const score = Math.max(
    0,
    Math.min(
      100,
      (Number(profile.utilization) <= 30 ? 25 : 10) +
        Math.min(25, Number(profile.age_months) * 2) +
        (Number(profile.overdue) === 0 ? 25 : 0) +
        Math.min(25, Number(profile.on_time) * 3),
    ),
  );
  return (
    <>
      <Heading
        title={t("creditReadiness")}
        subtitle={t("creditDisclaimer")}
        action={
          <button className="button" onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
        }
      />
      <div className="two-grid">
        <Card className="credit-score">
          <FinanceGauge value={score} />
          <h2>{t("creditReadiness")}</h2>
          <p className="muted">{t("creditDisclaimer")}</p>
        </Card>
        <Card>
          <h2>{t("goals")}</h2>
          {data.creditGuidance.map((task) => (
            <div className="credit-task" key={task}>
              <Checkbox
                checked={
                  !!data.creditTasks.find((x) => x.task_key === task)?.completed
                }
                onChange={(_, v) => run(() => toggleCreditTask(task, v))}
                slotProps={{ input: { "aria-label": t(task) } }}
              />
              <span>{t(task)}</span>
            </div>
          ))}
        </Card>
      </div>
      <div className="metrics-grid">
        {["utilization", "age_months", "overdue", "on_time"].map((k) => (
          <Metric key={k} label={t(k)} value={String(profile[k])} />
        ))}
      </div>
      {editing && (
        <FormDialog
          title="credit"
          fields={["utilization", "age_months", "overdue", "on_time"].map(
            (name) => ({
              name,
              type: "number",
              min: 0,
              max: name === "utilization" ? 100 : 1200,
            }),
          )}
          initial={Object.fromEntries(
            Object.entries(profile).map(([k, v]) => [k, String(v)]),
          )}
          submit={(v) =>
            updateCredit(
              Object.fromEntries(
                Object.entries(v).map(([k, v]) => [k, Number(v)]),
              ),
            )
          }
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
export function AlertsPage({ data }: { data: Workspace }) {
  const { t, run, locale } = useApp();
  const [add, setAdd] = useState(false);
  return (
    <>
      <Heading
        title={t("alerts")}
        action={
          <button className="button" onClick={() => setAdd(true)}>
            <FiPlus />
            {t("setReminder")}
          </button>
        }
      />
      <div className="stack">
        {data.alerts.map((a) => (
          <Card key={String(a.id)} className="alert-card">
            <span
              className={`alert-icon ${a.severity === "WARNING" ? "amber" : "mint"}`}
            >
              <FiBell />
            </span>
            <div>
              <div className="between">
                <h3>{t(String(a.type))}</h3>
                <Status value={String(a.severity)} />
              </div>
              {a.source_name && <strong>{a.source_name}</strong>}
              <p>{t(String(a.detail))}</p>
              <div className="button-group">
                {["READ", "SNOOZED", "DISMISSED"].map((status, i) => (
                  <button
                    className="text-link"
                    key={status}
                    onClick={() => run(() => updateAlert({ id: a.id, status }))}
                  >
                    {t(["markRead", "snooze", "dismiss"][i])}
                  </button>
                ))}
                <Link
                  className="text-link"
                  href={`/${locale}/${a.source_student ? "parent/students" : a.type === "TUITION" ? "tuition" : a.type === "BUDGET" ? "budget" : "agent"}`}
                >
                  {t("details")}
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!data.alerts.length && (
        <Card>
          <Empty />
        </Card>
      )}
      {add && (
        <FormDialog
          title="setReminder"
          fields={[{ name: "detail", label: "description", type: "textarea" }]}
          submit={(v) => createReminder(v.detail)}
          onClose={() => setAdd(false)}
        />
      )}
    </>
  );
}
export function ActivityPage({ data }: { data: Workspace }) {
  const { t, locale } = useApp();
  return (
    <>
      <Heading
        title={t("activity")}
        subtitle={t("evidenceIntro")}
        action={
          <ExportButton
            data={{
              transfers: data.transfers,
              runs: data.runs,
              tools: data.tools,
              audit: data.audit,
              sandbox: true,
            }}
          />
        }
      />
      <div className="two-grid">
        <Card>
          <h2>{t("executionTimeline")}</h2>
          <div className="timeline">
            {data.audit.map((a) => (
              <div className="timeline-step done" key={String(a.id)}>
                <span>
                  <FiCheck />
                </span>
                <div>
                  <strong>{t(String(a.action))}</strong>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: data.user.timezone,
                    }).format(
                      new Date(String(a.created_at).replace(" ", "T") + "Z"),
                    )}
                  </small>
                  <details>
                    <summary>{t("viewEvidence")}</summary>
                    <pre className="json-block">
                      {JSON.stringify(JSON.parse(String(a.metadata)), null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
          {!data.audit.length && <Empty />}
        </Card>
        <div className="stack">
          {data.runs.map((r) => (
            <Card key={String(r.id)}>
              <Status value={String(r.status)} />
              <h3>{r.goal}</h3>
              <small className="muted">
                {r.provider} · {r.created_at}
              </small>
              <div className="timeline compact">
                {data.tools
                  .filter((tool) => tool.run_id === r.id)
                  .map((tool) => (
                    <div className="timeline-step done" key={String(tool.id)}>
                      <span>
                        <FiCheck />
                      </span>
                      <div>
                        <strong>{t(String(tool.name))}</strong>
                        <details>
                          <summary>{t("toolResult")}</summary>
                          <pre className="json-block">
                            {JSON.stringify(
                              JSON.parse(String(tool.output)),
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
              </div>
              <ExportButton
                data={{
                  run: r,
                  tools: data.tools.filter((tool) => tool.run_id === r.id),
                }}
                name={String(r.id)}
              />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
export function ReportsPage({ data }: { data: Workspace }) {
  const { t } = useApp();
  const [add, setAdd] = useState(false);
  return (
    <>
      <Heading
        title={t("reports")}
        action={
          <button className="button" onClick={() => setAdd(true)}>
            <FiPlus />
            {t("reportProblem")}
          </button>
        }
      />
      <Card>
        <DataCards
          rows={data.reports}
          columns={[
            { key: "subject" },
            { key: "category", render: (r) => t(String(r.category)) },
            {
              key: "priority",
              render: (r) => <Status value={String(r.priority)} />,
            },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
            { key: "resolution" },
          ]}
        />
      </Card>
      {add && (
        <FormDialog
          title="reportProblem"
          fields={[
            {
              name: "category",
              options: [
                "AI",
                "TRANSACTION",
                "CALCULATION",
                "ACCOUNT",
                "APPLICATION",
              ].map((value) => ({ value, label: value })),
            },
            { name: "subject" },
            { name: "description", type: "textarea" },
            { name: "related_id", required: false },
            {
              name: "priority",
              options: ["LOW", "MEDIUM", "HIGH"].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          initial={{
            category: "APPLICATION",
            priority: "MEDIUM",
            related_id: "",
          }}
          submit={submitReport}
          onClose={() => setAdd(false)}
        />
      )}
    </>
  );
}
export function SettingsPage({ data }: { data: Workspace }) {
  const { t, locale, run, theme, toggleTheme, catalog } = useApp();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    name: data.user.name,
    preferred_currency: data.user.preferred_currency,
    timezone: data.user.timezone,
    country_code: data.user.country_code,
  });
  const [dialog, setDialog] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Heading title={t("settings")} />
      <div className="two-grid">
        <Card>
          <h2>{t("profile")}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              if (data.user.role !== "MODERATOR")
                await run(() => updateProfile(form.name));
              await run(
                () =>
                  updatePreferences({
                    preferred_currency: form.preferred_currency,
                    timezone: form.timezone,
                    country_code: form.country_code,
                  }),
                { quiet: true },
              );
              setBusy(false);
            }}
          >
            <FormFields
              fields={[
                ...(data.user.role !== "MODERATOR" ? [{ name: "name" }] : []),
                {
                  name: "country_code",
                  label: "currentCountry",
                  options: catalog.countries.map((c) => ({
                    value: c.code,
                    label: c.name,
                  })),
                },
                { name: "preferred_currency", options: currencyOptions },
                { name: "timezone" },
              ]}
              values={form}
              setValues={(v) =>
                setForm(
                  v.country_code !== form.country_code
                    ? {
                        ...v,
                        preferred_currency:
                          catalog.countries.find(
                            (c) => c.code === v.country_code,
                          )?.currency_code || "CNY",
                      }
                    : v,
                )
              }
            />
            <button className="button" disabled={busy}>
              {t(busy ? "loading" : "save")}
            </button>
          </form>
        </Card>
        <Card>
          <h2>{t("preferences")}</h2>
          <FormControlLabel
            control={
              <Switch checked={theme === "dark"} onChange={toggleTheme} />
            }
            label={t("dark")}
          />
          <div>
            <FormControlLabel
              control={
                <Switch
                  checked={!!data.user.notifications}
                  onChange={(_, v) =>
                    run(() => updatePreferences({ notifications: v }))
                  }
                />
              }
              label={t("notifications")}
            />
          </div>
          <div>
            <FormControlLabel
              control={
                <Switch
                  checked={!!data.user.auto_alerts}
                  onChange={(_, v) =>
                    run(() => updatePreferences({ auto_alerts: v }))
                  }
                />
              }
              label={t("auto_alerts")}
            />
          </div>
          <Link
            className="button secondary"
            href={`/${locale}/${data.user.role === "PARENT" ? "parent" : "family"}`}
          >
            {t("family")}
          </Link>
        </Card>
        <Card>
          <h2>
            <FiShield /> {t("security")}
          </h2>
          <p className="muted">{t("authSecurity")}</p>
          <button
            className="button secondary"
            onClick={() => setDialog("password")}
          >
            {t("changePassword")}
          </button>
          <Link
            className="text-link block"
            href={`/${locale}/security-assessment`}
          >
            {t("security-assessment")}
          </Link>
        </Card>
        <Card>
          <h2>{t("privacy")}</h2>
          <p className="muted">{t("privacyBody")}</p>
          <div className="stack">
            <button
              className="button secondary"
              onClick={async () => {
                const r = await run(exportMyData, { quiet: true });
                if (r) downloadJson(r, "my-financial-data");
              }}
            >
              <FiDownload />
              {t("downloadData")}
            </button>
            {!!data.user.is_demo && data.user.role === "STUDENT" && (
              <button
                className="button secondary"
                onClick={() => setDialog("clear")}
              >
                {t("clearDemoData")}
              </button>
            )}
            <button
              className="text-link danger-text"
              onClick={() => setDialog("close")}
            >
              {t("closeAccount")}
            </button>
          </div>
        </Card>
      </div>
      <IdentitySettings data={data} />
      <ModelManager data={data} />
      <SavedCards data={data} />
      {dialog === "password" && (
        <FormDialog
          title="changePassword"
          fields={[
            { name: "current", label: "currentPassword", type: "password" },
            { name: "password", type: "password" },
            { name: "confirm", label: "confirmPassword", type: "password" },
          ]}
          submit={changePassword}
          after={() => {
            router.push(`/${locale}/login`);
          }}
          onClose={() => setDialog("")}
        />
      )}{" "}
      {["clear", "close"].includes(dialog) && (
        <FormDialog
          title={dialog === "clear" ? "clearDemoData" : "closeAccount"}
          fields={[{ name: "email", label: "confirmEmail", type: "email" }]}
          submit={(v) =>
            dialog === "clear" ? clearDemoData(v.email) : closeAccount(v.email)
          }
          after={() => {
            if (dialog === "close") router.push(`/${locale}/login`);
          }}
          onClose={() => setDialog("")}
        />
      )}
    </>
  );
}
export { EvidencePage } from "./evidence-page";
