"use client";
import { GuidedInput, GuidedTextField as TextField } from "@/components/ui/dashboard-guidance";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FiPlus, FiUpload, FiSearch } from "react-icons/fi";
import Papa from "papaparse";
import { MenuItem } from "@mui/material";
import { useApp } from "@/components/ui/providers";
import {
  Heading,
  Card,
  FormDialog,
  DataCards,
  Modal,
  FormFields,
  Status,
  type Field,
} from "@/components/ui/primitives";
import {
  addTransaction,
  categorizeTransaction,
  importCsv,
  listTransactions,
} from "@/actions/transaction.actions";
import { categoryOptions, currencyOptions } from "./money-page";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { PaymentsPanel } from "@/components/payments/payments-panel";
export function TransactionsPage({ data }: { data: Workspace }) {
  const { t, locale, run } = useApp();
  const params = useSearchParams();
  const [view, setView] = useState("transactions");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [result, setResult] = useState<{ rows: Row[]; total: number } | null>(
    null,
  );
  const [filters, setFilters] = useState({
    search: params.get("search") || "",
    category: "",
    currency: "",
    account: params.get("account") || "",
    type: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const initialSearch = params.get("search") || "";
  const initialAccount = params.get("account") || "";
  useEffect(() => {
    if (!initialSearch && !initialAccount) return;
    let cancelled = false;
    void listTransactions({
      search: initialSearch,
      account: initialAccount,
      page: 0,
    }).then((r) => {
      if (!cancelled && r.success) setResult(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSearch, initialAccount]);
  const accounts = data.accounts.map((a) => ({
    value: String(a.id),
    label: String(a.name),
  }));
  const fields: Field[] = [
    { name: "account_id", label: "sourceAccount", options: accounts },
    { name: "description" },
    { name: "amount", type: "number", min: 0.01 },
    {
      name: "type",
      options: [
        { value: "EXPENSE", label: "EXPENSE" },
        { value: "INCOME", label: "INCOME" },
      ],
    },
    { name: "category", options: categoryOptions },
    { name: "date", type: "date" },
    { name: "notes", required: false },
  ];
  const search = async (n = 0) => {
    setBusy(true);
    const r = await run(() => listTransactions({ ...filters, page: n }), {
      quiet: true,
      refresh: false,
    });
    if (r) {
      setResult(r);
      setPage(n);
    }
    setBusy(false);
  };
  return (
    <>
      <p>{t("budgetRecordHelp")}</p>
      <Heading
        title={t("transactions")}
        action={
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() => setModal("csv")}
            >
              <FiUpload />
              {t("importCsv")}
            </button>
            <button className="button" onClick={() => setModal("add")}>
              <FiPlus />
              {t("addTransaction")}
            </button>
          </div>
        }
      />
      <div
        role="tablist"
        aria-label={t("transactions")}
        className="button-group"
      >
        {["transactions", "paymentRequests"].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={view === tab}
            className={`button ${view === tab ? "" : "secondary"}`}
            onClick={() => setView(tab)}
          >
            {t(tab)}
          </button>
        ))}
      </div>
      {view === "paymentRequests" ? (
        <PaymentsPanel data={data} compact />
      ) : (
        <Card>
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <TextField
              size="small"
              label={t("search")}
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
            {(
              [
                ["category", categoryOptions],
                ["currency", currencyOptions],
                ["account", accounts],
                [
                  "type",
                  [
                    { value: "INCOME", label: "INCOME" },
                    { value: "EXPENSE", label: "EXPENSE" },
                  ],
                ],
              ] as [keyof typeof filters, { value: string; label: string }[]][]
            ).map(([key, options]) => (
              <TextField
                select
                size="small"
                key={key}
                label={t(key)}
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              >
                <MenuItem value="">{t("all")}</MenuItem>
                {options.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {t(o.label)}
                  </MenuItem>
                ))}
              </TextField>
            ))}
            {["from", "to"].map((k) => (
              <TextField
                key={k}
                size="small"
                type="date"
                label={t(k)}
                slotProps={{ inputLabel: { shrink: true } }}
                value={filters[k as "from" | "to"]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: e.target.value })
                }
              />
            ))}
            <button className="button" disabled={busy}>
              <FiSearch />
              {t("filter")}
            </button>
          </form>
          <DataCards
            rows={result?.rows || data.transactions}
            columns={[
              { key: "description" },
              { key: "record_source", label: "recordSource", render: r => t(String(r.record_source || "LEDGER")) },
              { key: "category", render: (r) => t(String(r.category)) },
              {
                key: "date",
                render: (r) =>
                  new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(String(r.date))),
              },
              { key: "type", render: (r) => <Status value={String(r.type)} /> },
              {
                key: "amount",
                render: (r) =>
                  formatMoney(String(r.amount), String(r.currency), locale),
              },
            ]}
            actions={(r) => (
              <button className="text-link" onClick={() => setSelected(r)}>
                {t("details")}
              </button>
            )}
          />
          <div className="pagination">
            <button
              className="button secondary"
              disabled={!page || busy}
              onClick={() => search(page - 1)}
            >
              {t("previous")}
            </button>
            <span>
              {page + 1}
              {result ? ` / ${Math.max(1, Math.ceil(result.total / 20))}` : ""}
            </span>
            <button
              className="button secondary"
              disabled={
                busy ||
                (result
                  ? 20 * (page + 1) >= result.total
                  : data.transactions.length < 20)
              }
              onClick={() => search(page + 1)}
            >
              {t("next")}
            </button>
          </div>
        </Card>
      )}
      {modal === "add" && (
        <FormDialog
          title="addTransaction"
          fields={fields}
          initial={{
            account_id: accounts[0]?.value || "",
            type: "EXPENSE",
            category: "Other",
            date: new Date().toISOString().slice(0, 10),
            notes: "",
          }}
          submit={(v) => addTransaction(v)}
          onClose={() => setModal("")}
        />
      )}{" "}
      {modal === "csv" && (
        <CsvImport accounts={accounts} onClose={() => setModal("")} />
      )}{" "}
      {selected && (
        <Modal
          title={String(selected.description)}
          onClose={() => setSelected(null)}
        >
          <div className="detail-list">
            {["amount", "currency", "date", "notes", "confidence"].map((k) => (
              <div key={k}>
                <span>{t(k)}</span>
                <strong>{String(selected[k] ?? "—")}</strong>
              </div>
            ))}
          </div>
          <FormFields
            fields={[{ name: "category", options: categoryOptions }]}
            values={{ category: String(selected.category) }}
            setValues={async (v) => {
              const r = await run(() =>
                categorizeTransaction(String(selected.id), v.category),
              );
              if (r !== undefined)
                setSelected({ ...selected, category: v.category });
            }}
          />
        </Modal>
      )}
    </>
  );
}
function CsvImport({
  accounts,
  onClose,
}: {
  accounts: { value: string; label: string }[];
  onClose: () => void;
}) {
  const { t, run } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({
    account_id: accounts[0]?.value || "",
  });
  const [result, setResult] = useState<{
    imported: number;
    invalidRows: number[];
    invalidFields?: {row:number;fields:string[]}[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t("importCsv")} onClose={onClose} wide>
      <p className="muted">{t("csvHelp")}</p>
      <GuidedInput
        type="file"
        accept=".csv,text/csv"
        aria-label={t("importCsv")}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setFile(f);
          const p = Papa.parse<Record<string, string>>(await f.text(), {
            header: true,
            skipEmptyLines: true,
            preview: 6,
          });
          setHeaders(p.meta.fields || []);
          setPreview(p.data);
          setValues({
            account_id: accounts[0]?.value || "",
            ...Object.fromEntries((p.meta.fields || []).map((h) => [h, h])),
          });
        }}
      />
      {file && (
        <>
          <div className="dialog-fields">
            <FormFields
              fields={[
                { name: "account_id", options: accounts },
                ...[
                  "description",
                  "amount",
                  "type",
                  "category",
                  "date",
                  "notes",
                ].map((name) => ({
                  name,
                  required: name !== "notes",
                  options: [
                    { value: "", label: "—" },
                    ...headers.map((h) => ({ value: h, label: h })),
                  ],
                })),
              ]}
              values={values}
              setValues={setValues}
            />
          </div>
          <h3>{t("preview")}</h3>
          <div className="csv-preview">
            <DataCards
              rows={preview}
              columns={headers.map((key) => ({ key }))}
            />
          </div>
          <button
            disabled={busy}
            className="button"
            onClick={async () => {
              setBusy(true);
              const form = new FormData();
              form.set("file", file);
              form.set("account_id", values.account_id);
              form.set("mapping", JSON.stringify(values));
              const r = await run(() => importCsv(form), { quiet: true });
              if (r) setResult(r);
              setBusy(false);
            }}
          >
            {t(busy ? "loading" : "importCsv")}
          </button>
          {result && (
            <p role="status">
              {t("imported")}: {result.imported} · {t("invalidRows")}:{" "}
              {result.invalidRows.join(", ") || 0}
            </p>
          )}
          {result?.invalidFields?.map(row=><p role="alert" key={row.row}>{t("invalidRows")} {row.row}: {row.fields.map(t).join(", ")}</p>)}
        </>
      )}
    </Modal>
  );
}
