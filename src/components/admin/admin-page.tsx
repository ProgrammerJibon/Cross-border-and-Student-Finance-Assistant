"use client";
import { FinancialConfig } from "./financial-config";
import { useState } from "react";
import { TextField, MenuItem } from "@mui/material";
import { FiPlus, FiShield, FiUsers, FiZap, FiFlag } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Metric,
  DataCards,
  Status,
  FormDialog,
  Modal,
  ExportButton,
  type Field,
} from "@/components/ui/primitives";
import {
  FinanceBar,
  FinanceDonut,
  FinanceLine,
} from "@/components/charts/finance-charts";
import {
  manageUser,
  savePlan,
  resolveReport,
  saveProvider,
  saveRate,
} from "@/actions/admin.actions";
import { currencyOptions } from "@/components/accounts/money-page";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { parseJson } from "@/lib/json";
const boolOptions = [
  { value: "1", label: "active" },
  { value: "0", label: "cancel" },
];
const limitKeys = [
  "ACCOUNTS",
  "AGENT_MESSAGES",
  "TRANSFER_SIMULATIONS",
  "TUITION_PLANS",
  "CSV_IMPORTS",
  "PARENT_LINKS",
];
export function AdminPage({ data, path }: { data: Workspace; path: string }) {
  const { t, run } = useApp();
  const tab = path.split("/")[1] || "overview";
  const d = data.adminData;
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [dialog, setDialog] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const filtered = (items: Row[]) =>
    items.filter(
      (r) =>
        Object.values(r).some((v) =>
          String(v).toLowerCase().includes(query.toLowerCase()),
        ) &&
        (!role || r.role === role || r.status === role),
    );
  const open = (kind: string, row: Row = {}) => {
    setSelected(
      kind === "provider"
        ? {
            ...row,
            minimum: (Number(row.minimum) * Number(data.rates.CNY)).toFixed(2),
            maximum: (Number(row.maximum) * Number(data.rates.CNY)).toFixed(2),
          }
        : row,
    );
    setDialog(kind);
  };
  const months = [
    ...new Set(d.users.map((u) => String(u.created_at).slice(0, 7))),
  ];
  let content;
  if (tab === "overview")
    content = (
      <>
        <div className="metrics-grid">
          <Metric
            label={t("totalUsers")}
            value={d.users.length}
            icon={<FiUsers />}
          />
          <Metric
            label={t("agentRequests")}
            value={d.runs.length}
            icon={<FiZap />}
          />
          <Metric
            label={t("transfer")}
            value={d.transfers.length}
            icon={<FiShield />}
          />
          <Metric
            label={t("openReports")}
            value={d.reports.filter((r) => r.status === "OPEN").length}
            icon={<FiFlag />}
          />
        </div>
        <div className="two-grid">
          <Card>
            <h2>{t("users")}</h2>
            <FinanceLine
              labels={months}
              series={[
                {
                  label: "register",
                  data: months.map(
                    (m) =>
                      d.users.filter((u) => String(u.created_at).startsWith(m))
                        .length,
                  ),
                },
              ]}
            />
          </Card>
          <Card>
            <h2>{t("subscriptions")}</h2>
            <FinanceDonut
              data={data.plans.map((p) => ({
                label: String(p.name),
                value: d.subscriptions.filter((s) => s.plan_id === p.id).length,
              }))}
              total={String(d.subscriptions.length)}
              label="subscriptions"
            />
          </Card>
          <Card>
            <h2>{t("transfer")}</h2>
            <FinanceBar
              labels={["COMPLETED", "WAITING_APPROVAL", "CANCELLED"]}
              series={[
                {
                  label: "transfer",
                  data: ["COMPLETED", "WAITING_APPROVAL", "CANCELLED"].map(
                    (status) =>
                      d.transfers.filter((x) => x.status === status).length,
                  ),
                },
              ]}
            />
          </Card>
          <Card>
            <h2>{t("reports")}</h2>
            <FinanceBar
              labels={["OPEN", "IN_REVIEW", "RESOLVED"]}
              series={[
                {
                  label: "reports",
                  data: ["OPEN", "IN_REVIEW", "RESOLVED"].map(
                    (status) =>
                      d.reports.filter((x) => x.status === status).length,
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </>
    );
  else if (tab === "users")
    content = (
      <Card>
        <DataCards
          rows={filtered(d.users)}
          columns={[
            { key: "name" },
            { key: "email" },
            {
              key: "role",
              label: "type",
              render: (r) => <Status value={String(r.role)} />,
            },
            { key: "plan_id", label: "subscription" },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
          ]}
          actions={(r) => (
            <div className="button-group">
              <button className="text-link" onClick={() => open("user", r)}>
                {t("edit")}
              </button>
              <button
                className="text-link"
                onClick={() => run(() => manageUser({ id: r.id, reset: true }))}
              >
                {t("resetUsage")}
              </button>
            </div>
          )}
        />
      </Card>
    );
  else if (tab === "plans")
    content = (
      <Card>
        <DataCards
          rows={filtered(d.plans)}
          columns={[
            { key: "name", render: (r) => t(String(r.name)) },
            { key: "monthly" },
            { key: "yearly" },
            { key: "currency" },
            { key: "active" },
          ]}
          actions={(r) => (
            <button className="text-link" onClick={() => open("plan", r)}>
              {t("edit")}
            </button>
          )}
        />
      </Card>
    );
  else if (tab === "reports")
    content = (
      <Card>
        <DataCards
          rows={filtered(d.reports)}
          columns={[
            { key: "subject" },
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
          actions={(r) => (
            <button className="text-link" onClick={() => open("report", r)}>
              {t("edit")}
            </button>
          )}
        />
      </Card>
    );
  else if (tab === "finance")
    content = (
      <>
        <FinancialConfig data={data} />
        <Card>
          <h2>{t("provider")}</h2>
          <DataCards
            rows={filtered(d.providers)}
            columns={[
              { key: "name" },
              { key: "base_fee" },
              { key: "percentage_fee" },
              { key: "spread" },
              { key: "eta_days" },
            ]}
            actions={(r) => (
              <button className="text-link" onClick={() => open("provider", r)}>
                {t("edit")}
              </button>
            )}
          />
        </Card>
        <Card>
          <div className="between">
            <h2>{t("rate")}</h2>
            <button
              className="button secondary"
              onClick={() =>
                open("rate", {
                  currency: "BDT",
                  rate: (
                    Number(data.rates.BDT) / Number(data.rates.CNY)
                  ).toFixed(8),
                })
              }
            >
              {t("edit")}
            </button>
          </div>
          <DataCards
            rows={d.rates.map((r) => ({
              ...r,
              rate: (Number(r.rate) / Number(data.rates.CNY)).toFixed(8),
            }))}
            columns={[
              { key: "currency" },
              { key: "rate", label: "unitsPerRmb" },
              { key: "recorded_at", label: "date" },
            ]}
          />
        </Card>
      </>
    );
  else if (tab === "subscriptions")
    content = (
      <Card>
        <DataCards
          rows={filtered(d.subscriptions)}
          columns={[
            { key: "name" },
            { key: "plan", label: "subscription" },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
            { key: "ends_at", label: "billingCycle" },
          ]}
        />
        <h2>{t("paymentHistory")}</h2>
        <DataCards
          rows={d.payments}
          columns={[
            { key: "reference" },
            { key: "amount" },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
          ]}
        />
      </Card>
    );
  else {
    const list = tab === "risk" ? d.risk : tab === "agent" ? d.runs : d.audit;
    const cols =
      tab === "risk"
        ? ["user_id", "created_at"]
        : tab === "agent"
          ? ["goal", "status", "provider", "created_at"]
          : ["action", "entity_type", "entity_id", "created_at"];
    content = (
      <Card>
        <DataCards
          rows={filtered(list)}
          columns={cols.map((key) => ({ key }))}
          actions={(r) => (
            <button className="text-link" onClick={() => open("details", r)}>
              {t("viewEvidence")}
            </button>
          )}
        />
      </Card>
    );
  }
  const initial = Object.fromEntries(
    Object.entries(selected || {}).map(([k, v]) => [k, String(v ?? "")]),
  );
  if (dialog === "plan")
    Object.assign(initial, parseJson(selected?.limits, {}));
  const fields: Record<string, Field[]> = {
    user: [
      {
        name: "status",
        options: ["ACTIVE", "SUSPENDED"].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        name: "role",
        label: "type",
        options: ["STUDENT", "PARENT", "ADMIN"].map((value) => ({
          value,
          label: value,
        })),
      },
    ],
    plan: [
      { name: "id" },
      { name: "name" },
      { name: "description_key" },
      { name: "monthly", type: "number", min: 0 },
      { name: "yearly", type: "number", min: 0 },
      { name: "currency", options: currencyOptions },
      { name: "trial_days", type: "number", min: 0 },
      { name: "display_order", type: "number", min: 0 },
      { name: "active", options: boolOptions },
      { name: "recommended", options: boolOptions },
      ...limitKeys.map((name) => ({ name, type: "number", min: 0 })),
    ],
    report: [
      {
        name: "status",
        options: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"].map((value) => ({
          value,
          label: value,
        })),
      },
      { name: "resolution", type: "textarea", required: false },
      { name: "internal_note", type: "textarea", required: false },
    ],
    provider: [
      { name: "id" },
      { name: "name" },
      ...[
        "base_fee",
        "percentage_fee",
        "spread",
        "minimum",
        "maximum",
        "eta_days",
        "reliability",
      ].map((name) => ({ name, type: "number", min: 0 })),
      { name: "active", options: boolOptions },
    ],
    rate: [
      { name: "currency", options: currencyOptions },
      { name: "rate", label: "unitsPerRmb", type: "number", min: 0.00000001 },
    ],
  };
  return (
    <>
      <Heading
        eyebrow={t("admin")}
        title={t(tab)}
        action={
          <div className="button-group">
            <ExportButton data={d[tab] || d.audit} name={`admin-${tab}`} />
            {["plans", "finance"].includes(tab) && (
              <button
                className="button"
                onClick={() =>
                  open(
                    tab === "plans" ? "plan" : "provider",
                    tab === "plans"
                      ? {
                          id: "",
                          name: "",
                          description_key: "planStudent",
                          monthly: "0",
                          yearly: "0",
                          currency: "BDT",
                          trial_days: 0,
                          active: 1,
                          recommended: 0,
                          display_order: 4,
                          limits: JSON.stringify(
                            Object.fromEntries(limitKeys.map((k) => [k, 10])),
                          ),
                        }
                      : {
                          id: "",
                          name: "",
                          base_fee: "100",
                          percentage_fee: "0.002",
                          spread: "0.003",
                          minimum: "10",
                          maximum: "10000",
                          eta_days: 2,
                          reliability: 95,
                          active: 1,
                        },
                  )
                }
              >
                <FiPlus />
                {t("add")}
              </button>
            )}
          </div>
        }
      />
      {tab !== "overview" && (
        <div className="filters">
          <TextField
            label={t("search")}
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {tab === "users" && (
            <TextField
              label={t("filter")}
              size="small"
              select
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <MenuItem value="">{t("all")}</MenuItem>
              {["STUDENT", "PARENT", "ADMIN", "ACTIVE", "SUSPENDED"].map(
                (v) => (
                  <MenuItem value={v} key={v}>
                    {t(v)}
                  </MenuItem>
                ),
              )}
            </TextField>
          )}
        </div>
      )}
      {content}
      {dialog && dialog !== "details" && (
        <FormDialog
          title={
            dialog === "user"
              ? "users"
              : dialog === "plan"
                ? "plans"
                : dialog === "report"
                  ? "reports"
                  : dialog === "provider"
                    ? "provider"
                    : "rate"
          }
          fields={fields[dialog]}
          initial={initial}
          submit={(v) =>
            dialog === "user"
              ? manageUser({ ...v, id: selected?.id })
              : dialog === "plan"
                ? savePlan({
                    ...v,
                    trial_days: Number(v.trial_days),
                    display_order: Number(v.display_order),
                    active: v.active === "1",
                    recommended: v.recommended === "1",
                    limits: Object.fromEntries(
                      limitKeys.map((k) => [k, Number(v[k])]),
                    ),
                  })
                : dialog === "report"
                  ? resolveReport({ ...v, id: selected?.id })
                  : dialog === "provider"
                    ? saveProvider({ ...v, active: v.active === "1" })
                    : saveRate(v)
          }
          onClose={() => setDialog("")}
        />
      )}{" "}
      {dialog === "details" && (
        <Modal title={t("viewEvidence")} onClose={() => setDialog("")} wide>
          <pre className="json-block">{JSON.stringify(selected, null, 2)}</pre>
          {tab === "agent" &&
            d.tools
              .filter((tool) => tool.run_id === selected?.id)
              .map((tool) => (
                <details key={String(tool.id)}>
                  <summary>{t(String(tool.name))}</summary>
                  <pre className="json-block">
                    {JSON.stringify(parseJson(tool.output, {}), null, 2)}
                  </pre>
                </details>
              ))}
        </Modal>
      )}
    </>
  );
}
