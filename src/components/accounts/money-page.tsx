"use client";
import { useState } from "react";
import Link from "next/link";
import {
  FiPlus,
  FiCreditCard,
  FiEdit2,
  FiArchive,
  FiArrowUpRight,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  FormDialog,
  Badge,
  Empty,
  type Field,
} from "@/components/ui/primitives";
import { saveAccount, archiveAccount } from "@/actions/account.actions";
import { currencies } from "@/lib/config";
import { formatMoney } from "@/lib/money";

import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
export const currencyOptions = currencies.map((c) => ({ value: c, label: c }));
export const categoryOptions = [
  "Housing",
  "Food",
  "Education",
  "Transport",
  "Shopping",
  "Utilities",
  "Health",
  "Other",
  "Income",
].map((c) => ({ value: c, label: c }));
export function MoneyPage({ data }: { data: Workspace }) {
  const { t, locale, run } = useApp();
  const [editing, setEditing] = useState<Row | null>(null);

  const fields: Field[] = [
    { name: "name", label: "accountName" },
    {
      name: "type",
      options: ["BANK", "CASH", "WALLET", "SAVINGS"].map((v) => ({
        value: v,
        label: v,
      })),
    },
    ...(editing?.id ? [] : [{ name: "currency", options: currencyOptions }]),
  ];
  return (
    <>
      <Heading
        title={t("money")}
        subtitle={t("acrossAccounts")}
        action={
          <button
            className="button"
            onClick={() =>
              setEditing({
                name: "",
                type: "BANK",
                currency: data.user.preferred_currency,
                balance: "0",
              })
            }
          >
            <FiPlus />
            {t("addAccount")}
          </button>
        }
      />
      <div className="three-grid">
        {data.accounts.map((a, i) => (
          <Card
            key={String(a.id)}
            className={`account-card account-style-${i % 3}`}
          >
            <div className="between">
              <FiCreditCard size={26} />
              <Badge>{a.currency}</Badge>
            </div>
            <p>{a.name}</p>
            <h2>
              {formatMoney(String(a.balance), String(a.currency), locale)}
            </h2>
            <span className="muted">{t(String(a.type))}</span>
            <div className="account-actions">
              <Link
                className="text-link"
                href={`/${locale}/payments?kind=TOPUP&account=${a.id}`}
              >
                <FiPlus />
                {t("addMoney")}
              </Link>
              <button
                className="icon-button"
                aria-label={t("edit")}
                onClick={() => setEditing(a)}
              >
                <FiEdit2 />
              </button>
              <button
                className="icon-button"
                aria-label={t("archive")}
                onClick={() => run(() => archiveAccount(String(a.id)))}
              >
                <FiArchive />
              </button>
              <Link
                href={`/${locale}/transactions?account=${a.id}`}
                className="text-link"
              >
                {t("transactions")}
                <FiArrowUpRight />
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {!data.accounts.length && <Empty />}
      {editing && (
        <FormDialog
          title={editing.id ? "edit" : "addAccount"}
          fields={fields}
          initial={Object.fromEntries(
            Object.entries(editing).map(([k, v]) => [k, String(v ?? "")]),
          )}
          submit={(v) => saveAccount({ ...editing, ...v })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
