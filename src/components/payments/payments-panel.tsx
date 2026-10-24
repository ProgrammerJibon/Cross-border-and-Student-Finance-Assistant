"use client";
import { HostedCheckout, PaymentVerification } from "@/components/billing/hosted-checkout";
import { GatewaySettings } from "./gateway-settings";
import { formatDate } from "@/lib/dates";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  Heading,
  Modal,
  FormFields,
  FormDialog,
  DataCards,
  Status,
} from "@/components/ui/primitives";
import { useApp } from "@/components/ui/providers";
import {
  getPayments,
  draftPayment,
  confirmPaymentRequest,
  cancelPaymentRequest,
  settlePaymentRequest,
  parentPaymentDecision,
  addBeneficiary,
  parentBeneficiaryDecision,
  removeBeneficiary,
  savePaymentMethod,
  savePaymentPolicy,
} from "@/actions/payment.actions";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { parseJson } from "@/lib/json";
import { formatMoney } from "@/lib/money";

type PaymentData = Extract<
  Awaited<ReturnType<typeof getPayments>>,
  { success: true }
>["data"];
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
const booleanOptions = [
  { value: "1", label: "active" },
  { value: "0", label: "disabled" },
];
export function PaymentsPanel({
  data,
  mode = "payments",
  compact = false,
  initialKind = "SEND",
  initialAccount = "",
  focusId = "",
}: {
  data: Workspace;
  mode?: string;
  compact?: boolean;
  initialKind?: string;
  initialAccount?: string;
  focusId?: string;
}) {
  const { t, locale, run, catalog } = useApp();
  const search = useSearchParams();
  const [ws, setWs] = useState<PaymentData>({
    requests: [],
    beneficiaries: [],
    methods: [],
    events: [],
    policy: { nonBeneficiaryRmb: "1000" },
  });
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const refresh = useCallback(async () => {
    const r = await getPayments();
    if (r.success) {
      setWs(r.data);
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [refresh, data]);
  const admin = mode === "settlements";
  const methodAdmin = mode === "payment-methods";
  const parent = data.user.role === "PARENT";
  const accounts = data.accounts
    .filter((a) => a.type !== "CASH")
    .map((a) => ({
      value: String(a.id),
      label: `${a.name} · ${a.currency} · ${a.balance}`,
    }));
  const currencyOptions = catalog.currencies.map((c) => ({
    value: c.code,
    label: c.code === "CNY" ? "RMB (CNY)" : c.code,
  }));
  const openDraft = (kind = initialKind) => {
    const account =
      data.accounts.find(
        (a) =>
          a.type !== "CASH" &&
          a.id === (initialAccount || search.get("account")),
      ) || data.accounts.find((a) => a.type !== "CASH");
    setForm({
      kind,
      account_id: String(account?.id || ""),
      method:
        kind === "TOPUP" ? "UNIONPAY" : kind === "WITHDRAW" ? "BANK" : "INTERNAL",
      amount: search.get("amount") || "",
      recipient: "",
      destination: "",
      beneficiary_id: "",
      receive_currency: String(account?.currency || "CNY"),
      category: "Other",
      note: "",
    });
    setKey(crypto.randomUUID());
    setModal("draft");
  };
  const openConfirm = (r: Row) => {
    setSelected(r);
    setForm({
      cardholder: data.user.name,
      card: "",
      expiry: "",
      cvv: "",
      savedCardId: "",
      reference: "",
    });
    setSaveCard(false);
    setModal("confirm");
  };
  const done = async (fn: () => ReturnType<typeof confirmPaymentRequest>) => {
    setBusy(true);
    const r = await run(fn, { refresh: true });
    setBusy(false);
    if (r !== undefined) {
      await refresh();
      setModal("");
    }
  };
  const requestRows = ws.requests.filter((r) =>
    admin
      ? r.status !== "DRAFT"
      : mode === "approvals"
        ? r.user_id !== data.user.id && r.status === "WAITING_PARENT"
        : compact && focusId
          ? r.id === focusId
          : true,
  );
  const paymentMethod = ws.methods.find((m) => m.code === form.method);
  const displayRequest = (r: Row) => (
    <>
      <p>
        <strong>
          {formatMoney(String(r.amount), String(r.currency), locale)}
        </strong>{" "}
        · {t(String(r.kind))} · {r.method}
      </p>
      <p>
        {t("recipient")}: {r.recipient || r.owner_name || data.user.name}
      </p>
      <p className="prewrap">{r.destination}</p>
      <p>
        {t("receive")}:{" "}
        {formatMoney(
          String(r.receive_amount),
          String(r.receive_currency),
          locale,
        )}{" "}
        · {t("fee")}: 0
      </p>
      <p className="muted">{t("paymentReviewHelp")}</p>
    </>
  );
  return (
    <section className="payments-panel">
      {methodAdmin && <GatewaySettings/>}
      {search.get("checkout") && <Card><PaymentVerification id={search.get("checkout")!}/></Card>}
      {!compact && (
        <Heading title={t(mode)} subtitle={t("paymentWorkflowHelp")} />
      )}
      {!compact && !admin && !methodAdmin && mode === "payments" && (
        <div className="button-group payment-actions">
          {["SEND", "TOPUP", "WITHDRAW"].map((k) => (
            <button
              className="button"
              key={k}
              disabled={!accounts.length}
              onClick={() => openDraft(k)}
            >
              {t(k)}
            </button>
          ))}
        </div>
      )}
      {!accounts.length && !admin && !methodAdmin && (
        <p>{t("createWalletFirst")}</p>
      )}
      {methodAdmin ? (
        <>
          <FormDialogButton
            title="paymentPolicy"
            onClick={() => {
              setForm({ nonBeneficiaryRmb: ws.policy.nonBeneficiaryRmb });
              setModal("policy");
            }}
          />
          <DataCards
            rows={ws.methods}
            columns={[
              { key: "name" },
              { key: "code" },
              {
                key: "active",
                render: (r) => t(r.active ? "active" : "disabled"),
              },
              { key: "instructions" },
            ]}
            actions={(r) => (
              <button
                className="text-link"
                onClick={() => {
                  setSelected(r);
                  setForm(
                    Object.fromEntries(
                      Object.entries(r).map(([k, v]) => [k, String(v)]),
                    ),
                  );
                  setForm((f) => ({
                    ...f,
                    currencies: (
                      parseJson<string[]>(r.currencies, [])
                    ).join(", "),
                  }));
                  setModal("method");
                }}
              >
                {t("edit")}
              </button>
            )}
          />
        </>
      ) : (
        <>
          {mode !== "beneficiaries" && (
            <Card>
              <h2>{t(admin ? "settlements" : "paymentRequests")}</h2>
              <button className="text-link" onClick={() => void refresh()}>
                {t("refresh")}
              </button>
              {!loaded ? (
                <p>{t("loading")}</p>
              ) : (
                <DataCards
                  rows={requestRows}
                  columns={[
                    {
                      key: "id",
                      label: "reference",
                      render: (r) => String(r.id).slice(0, 8),
                    },
                    { key: "owner_name", label: "name" },
                    { key: "kind", render: (r) => t(String(r.kind)) },
                    { key: "method", label: "paymentMethod" },
                    {
                      key: "amount",
                      render: (r) =>
                        formatMoney(
                          String(r.amount),
                          String(r.currency),
                          locale,
                        ),
                    },
                    {
                      key: "status",
                      render: (r) => <Status value={String(r.status)} />,
                    },
                    { key: "note", label: "statusNote" },
                  ]}
                  actions={(r) => (
                    <div className="button-group">
                      <button
                        className="text-link"
                        onClick={() => {
                          setSelected(r);
                          setModal("history");
                        }}
                      >
                        {t("details")}
                      </button>
                      {r.user_id === data.user.id && (r.status === "DRAFT" || (r.kind === "TOPUP" && r.status === "PROCESSING")) && (
                        <button
                          className="button"
                          onClick={() => openConfirm(r)}
                        >
                          {t("reviewConfirm")}
                        </button>
                      )}
                      {r.user_id === data.user.id &&
                        ["DRAFT", "QUEUED", "WAITING_PARENT"].includes(
                          String(r.status),
                        ) && (
                          <button
                            className="text-link"
                            onClick={async () => {
                              await run(() =>
                                cancelPaymentRequest(String(r.id)),
                              );
                              await refresh();
                            }}
                          >
                            {t("cancel")}
                          </button>
                        )}
                      {parent &&
                        r.user_id !== data.user.id &&
                        r.status === "WAITING_PARENT" &&
                        ["approve", "reject"].map((decision) => (
                          <button
                            key={decision}
                            className="text-link"
                            onClick={() => {
                              setSelected(r);
                              setForm({
                                reason: "",
                                approve: String(decision === "approve"),
                              });
                              setModal("parentDecision");
                            }}
                          >
                            {t(decision)}
                          </button>
                        ))}
                      {admin &&
                        ["QUEUED", "PROCESSING"].includes(String(r.status)) && (
                          <button
                            className="button"
                            onClick={() => {
                              setSelected(r);
                              setForm({
                                status:
                                  r.status === "QUEUED"
                                    ? "PROCESSING"
                                    : "COMPLETED",
                                note: "",
                                reference: "",
                              });
                              setModal("settle");
                            }}
                          >
                            {t("processRequest")}
                          </button>
                        )}
                    </div>
                  )}
                />
              )}
            </Card>
          )}
          {!admin && !compact && mode === "beneficiaries" && (
            <Card>
              <div className="between">
                <h2>{t("beneficiaries")}</h2>
                <button
                  className="button"
                  onClick={() => {
                    setForm({
                      name: "",
                      method: "INTERNAL",
                      currency: data.user.preferred_currency,
                      country_code: data.user.country_code,
                      destination: "",
                    });
                    setModal("beneficiary");
                  }}
                >
                  {t("addBeneficiary")}
                </button>
              </div>
              <p>{t("beneficiaryHelp")}</p>
              <DataCards
                rows={ws.beneficiaries}
                columns={[
                  { key: "name" },
                  { key: "method", label: "paymentMethod" },
                  { key: "currency" },
                  { key: "owner_name", label: "owner" },
                  { key: "destination" },
                  {
                    key: "status",
                    render: (r) => <Status value={String(r.status)} />,
                  },
                ]}
                actions={(r) => (
                  <div className="button-group">
                    {r.user_id === data.user.id ? (
                      <button
                        className="text-link"
                        onClick={async () => {
                          await run(() => removeBeneficiary(String(r.id)));
                          await refresh();
                        }}
                      >
                        {t("remove")}
                      </button>
                    ) : (
                      parent &&
                      ["approve", "reject"].map((decision) => (
                        <button
                          className="text-link"
                          key={decision}
                          onClick={() => {
                            setSelected(r);
                            setForm({
                              reason: "",
                              approve: String(decision === "approve"),
                            });
                            setModal("beneficiaryDecision");
                          }}
                        >
                          {t(decision)}
                        </button>
                      ))
                    )}
                  </div>
                )}
              />
            </Card>
          )}
        </>
      )}
      {modal === "draft" && (
        <Modal
          title={t("paymentDraft")}
          onClose={() => !busy && setModal("")}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await run(
                () =>
                  draftPayment(
                    { ...form, beneficiary_id: form.beneficiary_id || null },
                    key,
                  ),
                { quiet: true, refresh: false },
              );
              setBusy(false);
              if (r) {
                await refresh();
                openConfirm(r as unknown as Row);
              }
            }}
          >
            <FormFields
              fields={[
                {
                  name: "kind",
                  label: "paymentType",
                  options: options(["SEND", "TOPUP", "WITHDRAW"]),
                },
                {
                  name: "account_id",
                  label: "sourceAccount",
                  options: accounts,
                },
                {
                  name: "method",
                  label: "paymentMethod",
                  options: [...ws.methods].sort((a,b) => {
                    const order=["UNIONPAY","STRIPE","ALIPAY","WECHAT","PAYPAL"];
                    return (order.includes(String(a.code))?order.indexOf(String(a.code)):99)-(order.includes(String(b.code))?order.indexOf(String(b.code)):99);
                  })
                    .filter(
                      (m) =>
                        m.active && (data.user.is_demo || m.code !== "CARD") &&
                        (form.kind === "TOPUP"
                          ? m.deposit_enabled
                          : form.kind === "WITHDRAW"
                            ? m.withdrawal_enabled
                            : m.code !== "CARD"),
                    )
                    .map((m) => ({
                      value: String(m.code),
                      label: String(m.name),
                    })),
                },
                { name: "amount", type: "number", min: 0.01 },
                {
                  name: "receive_currency",
                  label: "receiveCurrency",
                  options: currencyOptions,
                },
                ...(form.kind === "TOPUP"
                  ? []
                  : [
                      {
                        name: "beneficiary_id",
                        label: "beneficiary",
                        required: false,
                        options: [
                          { value: "", label: "oneTimeRecipient" },
                          ...ws.beneficiaries
                            .filter(
                              (b) =>
                                b.user_id === data.user.id &&
                                b.method === form.method &&
                                !["REMOVED", "REJECTED"].includes(
                                  String(b.status),
                                ),
                            )
                            .map((b) => ({
                              value: String(b.id),
                              label: `${b.name} · ${b.status}`,
                            })),
                        ],
                      },
                      { name: "recipient", required: !form.beneficiary_id },
                      {
                        name: "destination",
                        label:
                          form.method === "INTERNAL"
                            ? "recipientEmail"
                            : "recipientPaymentDetails",
                        type: "textarea",
                        required: !form.beneficiary_id,
                      },
                    ]),
                {
                  name: "category",
                  options: options([
                    "Housing",
                    "Food",
                    "Education",
                    "Transport",
                    "Shopping",
                    "Utilities",
                    "Health",
                    "Other",
                  ]),
                },
                { name: "note", required: false },
              ]}
              values={form}
              setValues={(next) => {
                const a = data.accounts.find((a) => a.id === next.account_id);
                const b = ws.beneficiaries.find(
                  (b) => b.id === next.beneficiary_id,
                );
                setForm({
                  ...next,
                  ...(next.kind !== form.kind
                    ? {
                        method:
                          next.kind === "TOPUP"
                            ? "UNIONPAY"
                            : next.kind === "WITHDRAW"
                              ? "BANK"
                              : "INTERNAL",
                        beneficiary_id: "",
                      }
                    : {}),
                  ...(next.method !== form.method
                    ? { beneficiary_id: "" }
                    : {}),
                  ...(next.account_id !== form.account_id ||
                  next.kind !== "SEND"
                    ? { receive_currency: String(a?.currency || "CNY") }
                    : {}),
                  ...(b && next.beneficiary_id !== form.beneficiary_id
                    ? {
                        recipient: String(b.name),
                        destination: String(b.destination),
                        receive_currency: String(b.currency),
                      }
                    : {}),
                });
              }}
            />
            {form.kind === "TOPUP" && (
              <p className="prewrap">{paymentMethod?.instructions}</p>
            )}
            <p className="muted">{t("noCardInChat")}</p>
            <button className="button" disabled={busy}>
              {t(busy ? "loading" : "reviewConfirm")}
            </button>
          </form>
        </Modal>
      )}
      {modal === "confirm" && selected && (
        <Modal title={t("reviewConfirm")} onClose={() => !busy && setModal("")}>
          {!data.user.is_demo && selected.kind === "TOPUP" && ["UNIONPAY","STRIPE","PAYPAL","ALIPAY","WECHAT"].includes(String(selected.method)) ? <>{displayRequest(selected)}<HostedCheckout requestId={String(selected.id)}/></> : <form
            onSubmit={(e) => {
              e.preventDefault();
              void done(() =>
                confirmPaymentRequest(
                  String(selected.id),
                  { ...form, saveCard },
                  form.reference || "",
                ),
              );
            }}
          >
            {displayRequest(selected)}
            {selected.kind === "TOPUP" && selected.method === "CARD" ? (
              <>
                <label>
                  {t("savedCards")}
                  <select
                    aria-label={t("savedCards")}
                    value={form.savedCardId}
                    onChange={(e) =>
                      setForm({ ...form, savedCardId: e.target.value })
                    }
                  >
                    <option value="">{t("newCard")}</option>
                    {data.savedCards.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.label} · {c.last_four}
                      </option>
                    ))}
                  </select>
                </label>
                {!form.savedCardId && (
                  <>
                    <button
                      type="button"
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
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(e) => setSaveCard(e.target.checked)}
                      />
                      {t("saveCard")}
                    </label>
                  </>
                )}
              </>
            ) : selected.kind === "TOPUP" ? (
              <>
                <p className="prewrap">{selected.payment_instructions}</p>
                <FormFields
                  fields={[{ name: "reference", label: "paymentReference" }]}
                  values={form}
                  setValues={setForm}
                />
                <p>{t("manualDepositHelp")}</p>
              </>
            ) : null}
            <button className="button" disabled={busy}>
              {t(busy ? "loading" : "confirmPayment")}
            </button>
          </form>}
        </Modal>
      )}
      {modal === "history" && selected && (
        <Modal title={t("paymentHistory")} onClose={() => setModal("")}>
          {displayRequest(selected)}
          <p>
            {t("reference")}: {selected.reference || "—"}
          </p>
          <p className="prewrap">{selected.payment_instructions}</p>
          <ol className="payment-timeline">
            {ws.events
              .filter((e) => e.request_id === selected.id)
              .map((e) => (
                <li key={String(e.id)}>
                  <Status value={String(e.status)} />
                  <small>
                    {formatDate(
                      String(e.created_at),
                      locale,
                      data.user.timezone,
                    )}
                  </small>
                  <p>{e.note}</p>
                </li>
              ))}
          </ol>
        </Modal>
      )}
      {["parentDecision", "beneficiaryDecision"].includes(modal) &&
        selected && (
          <FormDialog
            title={form.approve === "true" ? "approve" : "reject"}
            fields={[{ name: "reason", type: "textarea" }]}
            initial={form}
            submit={(v) =>
              modal === "parentDecision"
                ? parentPaymentDecision({
                    id: selected.id,
                    approve: form.approve === "true",
                    reason: v.reason,
                  })
                : parentBeneficiaryDecision({
                    id: selected.id,
                    approve: form.approve === "true",
                    reason: v.reason,
                  })
            }
            onClose={() => {
              setModal("");
              void refresh();
            }}
          />
        )}
      {modal === "settle" && selected && (
        <Modal
          title={t("processRequest")}
          onClose={() => !busy && setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await run(() =>
                settlePaymentRequest({ id: selected.id, ...form }),
              );
              setBusy(false);
              if (r !== undefined) {
                await refresh();
                setModal("");
              }
            }}
          >
            {displayRequest(selected)}
            <p className="prewrap">{selected.payment_instructions}</p>
            <FormFields
              fields={[
                {
                  name: "status",
                  options: options(
                    selected.status === "QUEUED"
                      ? ["PROCESSING", "REJECTED"]
                      : ["COMPLETED", "FAILED"],
                  ),
                },
                {
                  name: "reference",
                  label: "settlementReference",
                  required: form.status === "COMPLETED",
                },
                { name: "note", label: "statusNote", type: "textarea" },
              ]}
              values={form}
              setValues={setForm}
            />
            <p>{t("settlementHelp")}</p>
            <button className="button" disabled={busy}>
              {t("save")}
            </button>
          </form>
        </Modal>
      )}
      {modal === "beneficiary" && (
        <FormDialog
          title="addBeneficiary"
          fields={[
            { name: "name" },
            {
              name: "method",
              label: "paymentMethod",
              options: ws.methods
                .filter((m) => m.code !== "CARD")
                .map((m) => ({ value: String(m.code), label: String(m.name) })),
            },
            { name: "currency", options: currencyOptions },
            {
              name: "country_code",
              label: "currentCountry",
              options: catalog.countries.map((c) => ({
                value: c.code,
                label: c.name,
              })),
            },
            {
              name: "destination",
              label: "recipientPaymentDetails",
              type: "textarea",
              help: "beneficiaryDestinationHelp",
            },
          ]}
          initial={form}
          submit={(v) => addBeneficiary(v)}
          onClose={() => {
            setModal("");
            void refresh();
          }}
        />
      )}
      {modal === "method" && selected && (
        <FormDialog
          title="payment-methods"
          fields={[
            { name: "name" },
            { name: "active", options: booleanOptions },
            { name: "deposit_enabled", options: booleanOptions },
            { name: "withdrawal_enabled", options: booleanOptions },
            { name: "currencies", help: "methodCurrencyHelp" },
            {
              name: "instructions",
              label: "platformPaymentDetails",
              type: "textarea",
              required: false,
            },
          ]}
          initial={form}
          submit={(v) =>
            savePaymentMethod({
              ...v,
              code: selected.code,
              active: v.active === "1",
              deposit_enabled: v.deposit_enabled === "1",
              withdrawal_enabled: v.withdrawal_enabled === "1",
              currencies: v.currencies
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean),
            })
          }
          onClose={() => {
            setModal("");
            void refresh();
          }}
        />
      )}
      {modal === "policy" && (
        <FormDialog
          title="paymentPolicy"
          fields={[{ name: "nonBeneficiaryRmb", type: "number", min: 0 }]}
          initial={form}
          submit={savePaymentPolicy}
          onClose={() => {
            setModal("");
            void refresh();
          }}
        />
      )}
    </section>
  );
}
function FormDialogButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  const { t } = useApp();
  return (
    <button className="button" onClick={onClick}>
      {t(title)}
    </button>
  );
}
