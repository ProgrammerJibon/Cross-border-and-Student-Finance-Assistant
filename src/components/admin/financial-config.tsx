"use client";
import { parseJson } from "@/lib/json";
import { useState } from "react";
import { Card, FormDialog, DataCards, Modal } from "@/components/ui/primitives";
import { useApp } from "@/components/ui/providers";
import {
  saveFinancialPolicy,
  saveCorridor,
  saveCreditGuidance,
} from "@/actions/admin.actions";
import type { Workspace } from "@/types/workspace";
export function FinancialConfig({ data }: { data: Workspace }) {
  const { t, catalog, run } = useApp();
  const [dialog, setDialog] = useState("");
  const [source, setSource] = useState("CNY");
  const [target, setTarget] = useState("BDT");
  const [country, setCountry] = useState("default");
  const [tasks, setTasks] = useState<string[]>([]);
  const policy = data.financialPolicy;
  const d = data.adminData;
  const currencies = catalog.currencies.map((c) => ({
    value: c.code,
    label: c.code,
  }));
  const guidance = parseJson<Record<string, string[]>>(d.guidance?.[0]?.value, {}) as Record<
    string,
    string[]
  >;
  const keys = [
    "creditReminders",
    "creditUtilization",
    "creditHistory",
    "creditReport",
  ];
  return (
    <>
      <Card>
        <div className="between">
          <div>
            <h2>{t("financialPolicy")}</h2>
            <p>{t("financialPolicyHelp")}</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setDialog("risk")}
          >
            {t("edit")}
          </button>
        </div>
        <div className="detail-list">
          {policy &&
            [
              ["dailyRmb", policy.dailyCad * Number(data.rates.CNY)],
              ["monthlyRmb", policy.monthlyCad * Number(data.rates.CNY)],
              ["largeRmb", policy.largeCad * Number(data.rates.CNY)],
              ["frequency", policy.frequency],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <span>{t(String(key))}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
        </div>
      </Card>
      <Card>
        <div className="between">
          <h2>{t("corridors")}</h2>
          <button
            className="button secondary"
            onClick={() => setDialog("corridor")}
          >
            {t("addNew")}
          </button>
        </div>
        <label>
          {t("source_currency")}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("target_currency")}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <DataCards
          rows={(d.corridors || []).filter((c) => c.source_currency === source)}
          columns={[
            { key: "provider" },
            { key: "source_currency" },
            { key: "target_currency" },
          ]}
          actions={(r) => (
            <button
              className="text-link danger-text"
              onClick={() => run(() => saveCorridor({ ...r, remove: true }))}
            >
              {t("remove")}
            </button>
          )}
        />
      </Card>
      <Card>
        <div className="between">
          <h2>{t("creditGuidanceConfig")}</h2>
          <button
            className="button secondary"
            onClick={() => {
              setTasks(guidance.default || keys);
              setCountry("default");
              setDialog("guidance");
            }}
          >
            {t("edit")}
          </button>
        </div>
        <p>{t("creditGuidanceHelp")}</p>
        <DataCards
          rows={Object.entries(guidance).map(([country, tasks]) => ({
            country,
            tasks: tasks.map(t).join(" · "),
          }))}
          columns={[{ key: "country" }, { key: "tasks", label: "goals" }]}
        />
      </Card>
      {dialog === "risk" && policy && (
        <FormDialog
          title="financialPolicy"
          fields={[
            { name: "dailyRmb", type: "number", min: 0 },
            { name: "monthlyRmb", type: "number", min: 0 },
            { name: "largeRmb", type: "number", min: 0 },
            { name: "frequency", type: "number", min: 1 },
          ]}
          initial={{
            dailyRmb: String(policy.dailyCad * Number(data.rates.CNY)),
            monthlyRmb: String(policy.monthlyCad * Number(data.rates.CNY)),
            largeRmb: String(policy.largeCad * Number(data.rates.CNY)),
            frequency: String(policy.frequency),
          }}
          submit={saveFinancialPolicy}
          onClose={() => setDialog("")}
        />
      )}
      {dialog === "corridor" && (
        <FormDialog
          title="corridors"
          fields={[
            {
              name: "provider_id",
              label: "provider",
              options: d.providers.map((p) => ({
                value: String(p.id),
                label: String(p.name),
              })),
            },
            { name: "source_currency", options: currencies },
            { name: "target_currency", options: currencies },
          ]}
          initial={{
            source_currency: source,
            target_currency: source === "CNY" ? "BDT" : "CNY",
            provider_id: String(d.providers[0]?.id || ""),
          }}
          submit={saveCorridor}
          onClose={() => setDialog("")}
        />
      )}
      {dialog === "guidance" && (
        <Modal title={t("creditGuidanceConfig")} onClose={() => setDialog("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run(() =>
                saveCreditGuidance({ country, tasks }),
              );
              if (result !== undefined) setDialog("");
            }}
          >
            <label>
              {t("country")}
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setTasks(
                    guidance[e.target.value] || guidance.default || keys,
                  );
                }}
              >
                <option value="default">{t("default")}</option>
                {catalog.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="stack">
              {keys.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={tasks.includes(k)}
                    onChange={(e) =>
                      setTasks(
                        e.target.checked
                          ? [...tasks, k]
                          : tasks.filter((x) => x !== k),
                      )
                    }
                  />
                  {t(k)}
                </label>
              ))}
            </div>
            <button className="button" disabled={!tasks.length}>
              {t("save")}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
