"use client";
import { useState } from "react";
import {
  Card,
  Heading,
  DataCards,
  FormDialog,
  FormFields,
  Modal,
  type Field,
} from "@/components/ui/primitives";
import { ProfilePhoto } from "@/components/ui/profile-photo";
import { useApp } from "@/components/ui/providers";
import {
  saveCountry,
  saveCurrency,
  saveAiModel,
  testAiModel,
  deleteAiModel,
  selectAiModel,
  saveTeamMember,
  manageSavedCard,
  updateOwnIdentity,
} from "@/actions/platform.actions";
import { adminSections } from "@/lib/admin-permissions";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { parseJson } from "@/lib/json";
const bool = [
  { value: "1", label: "active" },
  { value: "0", label: "disabled" },
];
const strings = (row: Row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "")]));
export function ModelManager({
  data,
  shared = false,
}: {
  data: Workspace;
  shared?: boolean;
}) {
  const { t, run } = useApp();
  const [edit, setEdit] = useState<Row | null>(null);
  const owned = data.aiModels.filter((m) =>
    shared ? m.owner_id === null : m.owner_id === data.user.id,
  );
  const [savingModel, setSavingModel] = useState(false);
  const [testing, setTesting] = useState("");
  const [testResult, setTestResult] = useState("");
  return (
    <Card>
      <div className="between wrap">
        <div>
          <h2>{t(shared ? "sharedModels" : "myAiModels")}</h2>
          <p className="muted">{t("apiKeyPrivacy")}</p>
        </div>
        <button
          className="button"
          onClick={() =>
            setEdit({ company: "OPENAI", label: "", model: "", active: 1 })
          }
        >
          {t("addModel")}
        </button>
      </div>
      {!shared && (
        <label className="model-select">
          {t("selectedModel")}
          <select
            aria-label={t("selectedModel")}
            value={data.user.ai_model_id || ""}
            disabled={savingModel}
            onChange={async (e) => {
              setSavingModel(true);
              await run(() => selectAiModel(e.target.value));
              setSavingModel(false);
            }}
          >
            <option value="" disabled>
              {t("selectModel") || "Select a model"}
            </option>
            {data.aiModels
              .filter((m) => m.active)
              .map((m) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.label} · {m.company} ·{" "}
                  {m.owner_id ? t("personal") : t("shared")}
                </option>
              ))}
          </select>
        </label>
      )}
      {testResult && <p role="status">{t(testResult)}</p>}
      <DataCards
        rows={owned}
        columns={[
          { key: "label" },
          { key: "company" },
          { key: "model" },
          {
            key: "key_last_four",
            label: "apiKey",
            render: (r) => `••••${r.key_last_four}`,
          },
          { key: "active", render: (r) => t(r.active ? "active" : "disabled") },
        ]}
        actions={(r) => (
          <div className="button-group">
            <button
              className="text-link"
              disabled={!!testing}
              onClick={async () => {
                setTesting(String(r.id));
                setTestResult("");
                try {
                  const result = await testAiModel(String(r.id), shared);
                  setTestResult(
                    result.success ? "modelConnectionSuccess" : result.code,
                  );
                } catch {
                  setTestResult("AI_UNAVAILABLE");
                } finally {
                  setTesting("");
                }
              }}
            >
              {t(testing === r.id ? "testingConnection" : "testConnection")}
            </button>
            <button className="text-link" onClick={() => setEdit(r)}>
              {t("edit")}
            </button>
            <button
              className="text-link danger-text"
              onClick={() => run(() => deleteAiModel(String(r.id), shared))}
            >
              {t("remove")}
            </button>
          </div>
        )}
      />
      {edit && (
        <FormDialog
          title="addModel"
          fields={[
            { name: "label" },
            {
              name: "company",
              options: [
                { value: "OPENAI", label: "OpenAI" },
                { value: "GEMINI", label: "Google Gemini" },
                { value: "ANTHROPIC", label: "Anthropic Claude" },
                { value: "COMPATIBLE", label: "compatibleProvider" },
              ],
            },
            { name: "model", help: "modelNameHelp" },
            {
              name: "base_url",
              label: "providerBaseUrl",
              required: false,
              help: "providerBaseUrlHelp",
            },
            {
              name: "input_price",
              label: "inputTokenPrice",
              required: false,
              help: "tokenPriceHelp",
            },
            {
              name: "output_price",
              label: "outputTokenPrice",
              required: false,
            },
            {
              name: "key",
              label: "apiKey",
              type: "password",
              required: !edit.id,
              help: "keyReplaceHelp",
            },
            { name: "active", options: bool },
          ]}
          initial={strings(edit)}
          submit={(v) =>
            saveAiModel({
              ...v,
              id: edit.id || undefined,
              shared,
              active: v.active === "1",
            })
          }
          onClose={() => setEdit(null)}
        />
      )}
    </Card>
  );
}
export function SavedCards({ data }: { data: Workspace }) {
  const { t, run } = useApp();
  const [edit, setEdit] = useState<Row | null>(null);
  return (
    <Card>
      <h2>{t("savedCards")}</h2>
      <p className="muted">{t("savedCardHelp")}</p>
      <DataCards
        rows={data.savedCards}
        columns={[
          { key: "label" },
          { key: "last_four", render: (r) => `•••• ${r.last_four}` },
          { key: "expiry" },
        ]}
        actions={(r) => (
          <div className="button-group">
            <button className="text-link" onClick={() => setEdit(r)}>
              {t("edit")}
            </button>
            <button
              className="text-link danger-text"
              onClick={() =>
                run(() => manageSavedCard({ id: r.id, remove: true }))
              }
            >
              {t("remove")}
            </button>
          </div>
        )}
      />
      {edit && (
        <FormDialog
          title="savedCards"
          fields={[{ name: "label" }]}
          initial={strings(edit)}
          submit={(v) => manageSavedCard({ id: edit.id, label: v.label })}
          onClose={() => setEdit(null)}
        />
      )}
    </Card>
  );
}
export function IdentitySettings({ data }: { data: Workspace }) {
  const { t, run } = useApp();
  const [form, setForm] = useState({
    email: data.user.email,
    avatar: data.user.avatar || "",
    portfolio: String(data.myTeam[0]?.portfolio || ""),
  });
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h2>{t("profilePhoto")}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await run(() => updateOwnIdentity(form));
          setBusy(false);
        }}
      >
        <ProfilePhoto
          required
          value={form.avatar}
          onChange={(avatar) => setForm({ ...form, avatar })}
        />
        <FormFields
          fields={[
            { name: "email", type: "email" },
            ...(data.user.role === "MODERATOR"
              ? [{ name: "portfolio", type: "url", required: false }]
              : []),
          ]}
          values={form}
          setValues={(v) => setForm({ ...form, ...v })}
        />
        <button className="button" disabled={busy}>
          {t("save")}
        </button>
      </form>
    </Card>
  );
}
export function CatalogAdmin({ data }: { data: Workspace }) {
  const { t, catalog } = useApp();
  const [kind, setKind] = useState("");
  const [edit, setEdit] = useState<Row>({});
  const [query, setQuery] = useState("");
  const open = (type: string, row: Row = {}) => {
    setKind(type);
    setEdit(row);
  };
  const fields: Field[] =
    kind === "currency"
      ? [
          { name: "code" },
          { name: "name" },
          { name: "symbol" },
          {
            name: "rate",
            label: "unitsPerRmb",
            type: "number",
            min: 0.00000001,
          },
          { name: "active", options: bool },
        ]
      : [
          { name: "code", label: "countryCode" },
          { name: "name" },
          {
            name: "currency_code",
            label: "defaultCurrency",
            options: catalog.currencies.map((c) => ({
              value: c.code,
              label: c.code === "CNY" ? "RMB (CNY)" : c.code,
            })),
          },
          { name: "active", options: bool },
        ];
  return (
    <>
      <Heading title={t("catalog")} subtitle={t("catalogHelp")} />
      <input
        className="catalog-search"
        aria-label={t("search")}
        placeholder={t("search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {["currencies", "countries"].map((type) => (
        <Card key={type}>
          <div className="between">
            <h2>{t(type)}</h2>
            <button
              className="button"
              onClick={() =>
                open(type === "currencies" ? "currency" : "country", {
                  active: 1,
                  currency_code: "CNY",
                  rate: "1",
                })
              }
            >
              {t("add")}
            </button>
          </div>
          <DataCards
            rows={(data.adminData[type] || []).filter((r) =>
              `${r.name} ${r.code}`.toLowerCase().includes(query.toLowerCase()),
            )}
            columns={[
              { key: "code" },
              { key: "name" },
              { key: type === "countries" ? "currency_code" : "symbol" },
              {
                key: "active",
                render: (r) => t(r.active ? "active" : "disabled"),
              },
            ]}
            actions={(r) => (
              <button
                className="text-link"
                onClick={() =>
                  open(type === "currencies" ? "currency" : "country", {
                    ...r,
                    rate: String(
                      Number(data.rates[String(r.code)] || 1) /
                        Number(data.rates.CNY),
                    ),
                  })
                }
              >
                {t("edit")}
              </button>
            )}
          />
        </Card>
      ))}
      {kind && (
        <FormDialog
          title={kind === "currency" ? "currencies" : "countries"}
          fields={fields}
          initial={strings(edit)}
          submit={(v) =>
            kind === "currency"
              ? saveCurrency({ ...v, active: v.active === "1" })
              : saveCountry({ ...v, active: v.active === "1" })
          }
          onClose={() => setKind("")}
        />
      )}
    </>
  );
}
export function TeamAdmin({ data }: { data: Workspace }) {
  const { t, run } = useApp();
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const open = (row: Row) => {
    setEdit(row);
    setForm({
      ...strings(row),
      avatar: String(row.avatar || ""),
      password: "",
    });
    setPermissions(parseJson<string[]>(row.admin_permissions, []));
  };
  return (
    <>
      <Heading
        title={t("team")}
        subtitle={t("teamAdminHelp")}
        action={
          data.user.role === "ADMIN" ? (
            <button
              className="button"
              onClick={() =>
                open({
                  active: 1,
                  published: 0,
                  is_ceo: 0,
                  display_order: 0,
                  department: "",
                  designation: "",
                  portfolio: "",
                  phone: "",
                })
              }
            >
              {t("addModerator")}
            </button>
          ) : undefined
        }
      />
      <Card>
        <DataCards
          rows={data.adminData.team || []}
          columns={[
            { key: "name" },
            { key: "department" },
            { key: "designation" },
            { key: "email" },
            { key: "status" },
          ]}
          actions={
            data.user.role === "ADMIN"
              ? (r) => (
                  <button
                    className="text-link"
                    onClick={() =>
                      open({ ...r, active: r.status === "ACTIVE" ? 1 : 0 })
                    }
                  >
                    {t("edit")}
                  </button>
                )
              : undefined
          }
        />
      </Card>
      {edit && (
        <Modal
          title={t("team")}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const result = await run(() =>
                saveTeamMember({
                  ...form,
                  id: edit.id || undefined,
                  permissions,
                  active: form.active === "1",
                  published: form.published === "1",
                  is_ceo: form.is_ceo === "1",
                }),
              );
              setBusy(false);
              if (result !== undefined) setEdit(null);
            }}
          >
            <ProfilePhoto
              required
              value={form.avatar || ""}
              onChange={(avatar) => setForm({ ...form, avatar })}
            />
            <FormFields
              fields={[
                { name: "name" },
                { name: "email", type: "email" },
                { name: "password", type: "password", required: !edit.id },
                { name: "department" },
                { name: "designation" },
                { name: "phone", type: "tel", required: false },
                { name: "portfolio", type: "url", required: false },
                { name: "is_ceo", label: "ceo", options: bool },
                { name: "published", options: bool },
                { name: "active", options: bool },
                { name: "display_order", type: "number", min: 0 },
              ]}
              values={form}
              setValues={setForm}
            />
            <h3>{t("moderatorPermissions")}</h3>
            <div className="permission-grid">
              {adminSections
                .filter((s) => s !== "team")
                .map((section) => (
                  <label key={section}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(section)}
                      onChange={(e) =>
                        setPermissions(
                          e.target.checked
                            ? [...permissions, section]
                            : permissions.filter((p) => p !== section),
                        )
                      }
                    />
                    {t(section)}
                  </label>
                ))}
            </div>
            <button className="button" disabled={busy}>
              {t("save")}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
