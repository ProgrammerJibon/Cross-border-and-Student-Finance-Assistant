"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FiArrowRight,
  FiShield,
  FiCheck,
  FiSend,
  FiClock,
  FiArrowUpRight,
} from "react-icons/fi";
import {
  compareTransfers,
  prepareTransfer,
  approveTransfer,
  executeTransfer,
} from "@/actions/transfer.actions";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  FormFields,
  Badge,
  Modal,
  Status,
  ExportButton,
  DataCards,
  type Field,
} from "@/components/ui/primitives";
import { currencyOptions } from "@/components/accounts/money-page";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
type Quote = Extract<
  Awaited<ReturnType<typeof compareTransfers>>,
  { success: true }
>["data"][number];
export function TransferPage({
  data,
  conversion = false,
}: {
  data: Workspace;
  conversion?: boolean;
}) {
  const { t, locale, run } = useApp();
  const params = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>({
    amount: params.get("amount") || "8000",
    source: params.get("source") || "BDT",
    target:
      params.get("target") ||
      String(
        data.tuition.find((i) => i.id === params.get("invoice"))?.currency ||
          "CNY",
      ),
    purpose: conversion
      ? "CONVERSION"
      : params.get("invoice")
        ? "TUITION"
        : "TUITION",
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Quote | Row | null>(null);
  const [existing, setExisting] = useState<Row | null>(null);
  const fields: Field[] = [
    { name: "source", options: currencyOptions },
    { name: "target", options: currencyOptions },
    { name: "amount", label: "receiveAmount", type: "number", min: 0.01 },
    {
      name: "purpose",
      options: (conversion
        ? ["CONVERSION"]
        : ["TUITION", "LIVING", "FAMILY", "PERSONAL"]
      ).map((v) => ({ value: v, label: v })),
    },
  ];
  const fmt = (n: string, c: string) => formatMoney(n, c, locale);
  return (
    <>
      <Heading
        eyebrow={t("sandbox")}
        title={t(conversion ? "conversion" : "transferTitle")}
        subtitle={t("transferSubtitle")}
      />
      <Card className="transfer-form">
        <div className="corridor">
          <span>🇧🇩</span>
          <div className="corridor-line" />
          <FiSend />
          <div className="corridor-line" />
          <span>🇨🇳</span>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const q = await run(() => compareTransfers(values), {
              quiet: true,
              refresh: false,
            });
            if (q) setQuotes(q);
            setBusy(false);
          }}
        >
          <FormFields fields={fields} values={values} setValues={setValues} />
          <div className="between wrap">
            <span className="muted small-text">
              <FiShield /> {t("quoteExpiry")}
            </span>
            <button className="button" disabled={busy}>
              {t(busy ? "loading" : "compare")}
              <FiArrowRight />
            </button>
          </div>
        </form>
      </Card>
      {!!quotes.length && (
        <>
          <div className="section-title">
            <h2>{t("compareRates")}</h2>
            <Badge>
              {quotes.length} {t("provider")}
            </Badge>
          </div>
          <div className="quote-grid">
            {quotes.map((q, i) => (
              <Card
                key={q.id}
                className={`quote-card ${i === 0 ? "recommended-quote" : ""}`}
              >
                <div className="between">
                  <span className="provider-symbol">{q.provider[0]}</span>
                  {i === 0 ? (
                    <Badge>{t("cheapest")}</Badge>
                  ) : q.eta_days ===
                    Math.min(...quotes.map((q) => q.eta_days)) ? (
                    <Badge tone="blue">{t("fastest")}</Badge>
                  ) : (
                    <Badge tone="gray">{q.reliability}%</Badge>
                  )}
                </div>
                <h3>{q.provider}</h3>
                <small>{t("youPay")}</small>
                <strong className="quote-total">
                  {fmt(q.total, q.source_currency)}
                </strong>
                <div className="detail-list">
                  <div>
                    <span>{t("receiveAmount")}</span>
                    <b>{fmt(q.receive_amount, q.target_currency)}</b>
                  </div>
                  <div>
                    <span>{t("fee")}</span>
                    <b>{fmt(q.fee, q.source_currency)}</b>
                  </div>
                  <div>
                    <span>{t("eta")}</span>
                    <b>
                      <FiClock /> {q.eta_days} {t("days")}
                    </b>
                  </div>
                  <div>
                    <span>{t("rate")}</span>
                    <b>{Number(q.rate).toFixed(5)}</b>
                  </div>
                </div>
                <button
                  className={`button full ${i ? "secondary" : ""}`}
                  onClick={() => {
                    setSelected(q);
                    setExisting(null);
                  }}
                >
                  {t("reviewTransfer")}
                  <FiArrowRight />
                </button>
              </Card>
            ))}
          </div>
        </>
      )}
      <Card>
        <div className="section-title">
          <h2>{t("activity")}</h2>
        </div>
        <DataCards
          rows={data.transfers}
          columns={[
            { key: "recipient" },
            { key: "provider" },
            {
              key: "receive_amount",
              label: "received",
              render: (r) =>
                fmt(String(r.receive_amount), String(r.target_currency)),
            },
            {
              key: "status",
              render: (r) => <Status value={String(r.status)} />,
            },
          ]}
          actions={(r) => (
            <button
              className="text-link"
              onClick={() => {
                setSelected(r);
                setExisting(r);
              }}
            >
              {t(r.status === "COMPLETED" ? "receipt" : "reviewTransfer")}
              <FiArrowUpRight />
            </button>
          )}
        />
      </Card>
      {selected && (
        <TransferReview
          quote={selected}
          existing={existing}
          data={data}
          purpose={String(existing?.purpose || values.purpose)}
          initialInvoice={params.get("invoice") || ""}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function TransferReview({
  quote,
  existing,
  data,
  purpose,
  initialInvoice,
  onClose,
}: {
  quote: Quote | Row;
  existing: Row | null;
  data: Workspace;
  purpose: string;
  initialInvoice: string;
  onClose: () => void;
}) {
  const { t, locale, run } = useApp();
  const [form, setForm] = useState<Record<string, string>>({
    accountId: String(
      existing?.account_id ||
        data.accounts.find((a) => a.currency === quote.source_currency)?.id ||
        "",
    ),
    recipient: String(
      existing?.recipient || data.profile[0]?.university || "Sandbox recipient",
    ),
    invoiceId: String(existing?.invoice_id || initialInvoice),
    destinationId: String(existing?.destination_id || ""),
  });
  const [transfer, setTransfer] = useState<{
    id: string | null;
    status: string;
    risk: unknown;
  } | null>(
    existing
      ? {
          id: String(existing.id),
          status: String(existing.status),
          risk: existing.risk ? JSON.parse(String(existing.risk)) : null,
        }
      : null,
  );
  const [receipt, setReceipt] = useState<Row | null>(
    existing?.status === "COMPLETED" ? existing : null,
  );
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const q = (key: string) =>
    String((quote as unknown as Record<string, unknown>)[key] ?? "");
  const fmt = (key: string, currency: string) =>
    formatMoney(q(key), q(currency), locale);
  const fields: Field[] = [
    {
      name: "accountId",
      label: "sourceAccount",
      options: data.accounts
        .filter((a) => a.currency === q("source_currency"))
        .map((a) => ({
          value: String(a.id),
          label: `${a.name} · ${formatMoney(String(a.balance), String(a.currency), locale)}`,
        })),
    },
    { name: "recipient" },
    ...(purpose === "TUITION"
      ? [
          {
            name: "invoiceId",
            label: "invoice",
            required: false,
            options: [
              { value: "", label: "noInvoice" },
              ...data.tuition
                .filter((i) => i.currency === q("target_currency"))
                .map((i) => ({ value: String(i.id), label: String(i.name) })),
            ],
          },
        ]
      : []),
    ...(purpose === "CONVERSION"
      ? [
          {
            name: "destinationId",
            label: "destination",
            options: data.accounts
              .filter((a) => a.currency === q("target_currency"))
              .map((a) => ({ value: String(a.id), label: String(a.name) })),
          },
        ]
      : []),
  ];
  return (
    <Modal
      title={t(receipt ? "receipt" : "reviewTransfer")}
      onClose={onClose}
      wide
    >
      <div className="review-amount">
        <span>{q("source_currency")}</span>
        <strong>{fmt("total", "source_currency")}</strong>
        <FiArrowRight />
        <strong>{fmt("receive_amount", "target_currency")}</strong>
      </div>
      <div className="detail-list">
        <div>
          <span>{t("provider")}</span>
          <b>{q("provider")}</b>
        </div>
        <div>
          <span>{t("fee")}</span>
          <b>{fmt("fee", "source_currency")}</b>
        </div>
        <div>
          <span>{t("rate")}</span>
          <b>{q("rate")}</b>
        </div>
      </div>
      {receipt ? (
        <div className="success-panel">
          <FiCheck />
          <h2>{t("transferSuccess")}</h2>
          <p>{String(receipt.reference)}</p>
          <Badge>{t("COMPLETED")}</Badge>
          <div className="button-group">
            <ExportButton
              data={{ ...receipt, quote, sandbox: true }}
              name={String(receipt.reference)}
            />
            <Link href={`/${locale}/activity`} className="button secondary">
              {t("viewEvidence")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <fieldset
            disabled={!!transfer?.id || busy}
            className="transfer-fields"
          >
            <FormFields fields={fields} values={form} setValues={setForm} />
          </fieldset>
          {transfer && (
            <div className="risk-panel">
              <Status value={transfer.status} />
              {!!transfer.risk && (
                <div className="risk-flags">
                  {((transfer.risk as { flags: string[] }).flags || []).map(
                    (flag) => (
                      <Badge key={flag} tone="amber">
                        {t(flag)}
                      </Badge>
                    ),
                  )}
                </div>
              )}
              {transfer.status === "WAITING_APPROVAL" && (
                <p>{t("waitingParentBody")}</p>
              )}
            </div>
          )}
          <p className="muted">{t("sandboxDisclosure")}</p>
          <div className="sticky-confirm">
            {!transfer || transfer.status === "BLOCKED" ? (
              <button
                disabled={busy}
                className="button full"
                onClick={async () => {
                  setBusy(true);
                  const r = await run(
                    () =>
                      prepareTransfer({
                        quoteId: q("id"),
                        accountId: form.accountId,
                        recipient: form.recipient,
                        purpose,
                        invoiceId: form.invoiceId || undefined,
                        destinationId: form.destinationId || undefined,
                      }),
                    { quiet: true },
                  );
                  if (r) setTransfer(r);
                  setBusy(false);
                }}
              >
                <FiShield />
                {t(busy ? "loading" : "prepare")}
              </button>
            ) : (
              transfer.status !== "CANCELLED" && (
                <button
                  className="button full"
                  disabled={busy}
                  onClick={async () => {
                    if (!transfer.id) return;
                    setBusy(true);
                    setPhase("APPROVAL_REQUIRED");
                    const approval = await run(
                      () => approveTransfer(transfer.id!),
                      { quiet: true, refresh: false },
                    );
                    if (approval) {
                      setPhase("PROCESSING");
                      const result = await run(
                        () => executeTransfer(transfer.id!, approval.token),
                        { quiet: true },
                      );
                      if (result) setReceipt(result);
                    }
                    setPhase("");
                    setBusy(false);
                  }}
                >
                  <FiCheck />
                  {t(busy ? phase : "approveExecute")}
                </button>
              )
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
