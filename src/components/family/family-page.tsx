"use client";
import { useState } from "react";
import Link from "next/link";
import { Switch, FormControlLabel } from "@mui/material";
import { FiUsers, FiPlus, FiShield, FiCheck, FiX } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  FormDialog,
  Modal,
  Status,
  Metric,
  DataCards,
  Empty,
} from "@/components/ui/primitives";
import {
  inviteStudent,
  acceptInvitation,
  updateFamily,
  updateControls,
  decideApproval,
  setStudentSharing,
} from "@/actions/parent.actions";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
import { parseJson } from "@/lib/json";
export function FamilyPage({ data, path }: { data: Workspace; path: string }) {
  const { t, locale, run, toast } = useApp();
  const [dialog, setDialog] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [token, setToken] = useState("");
  const parent = data.user.role === "PARENT";
  const overview = parent && path === "parent";
  const showLinks =
    !parent || ["parent/students", "parent/controls"].includes(path);
  const pending = data.approvals.filter((p) => p.status === "PENDING");
  return (
    <>
      <Heading
        title={t(parent ? path.split("/")[1] || "family" : "family")}
        subtitle={t(parent ? "sharedOnly" : "familyPrivacy")}
        action={
          <button
            className="button"
            onClick={() => setDialog(parent ? "invite" : "accept")}
          >
            <FiPlus />
            {t(parent ? "inviteStudent" : "acceptInvitation")}
          </button>
        }
      />
      {overview && (
        <div className="metrics-grid">
          <Metric
            label={t("linkedStudents")}
            value={data.parentStudents.length}
            icon={<FiUsers />}
          />
          <Metric
            label={t("approvals")}
            value={pending.length}
            icon={<FiShield />}
          />
          <Metric
            label={t("APPROVED")}
            value={data.approvals.filter((a) => a.status === "APPROVED").length}
          />
          <Metric
            label={t("REJECTED")}
            value={data.approvals.filter((a) => a.status === "REJECTED").length}
          />
        </div>
      )}
      {overview && (
        <Card>
          <h2>{t("family")}</h2>
          <p>{t("sharedOnly")}</p>
          <div className="button-group">
            {["students", "controls", "approvals"].map((section) => (
              <Link
                key={section}
                className="button secondary"
                href={`/${locale}/parent/${section}`}
              >
                {t(section)}
              </Link>
            ))}
          </div>
        </Card>
      )}
      {showLinks && (
        <div className="two-grid">
          {data.family
            .filter((f) => f.status !== "REVOKED")
            .map((f) => {
              const visibility = parseJson<Record<string, boolean>>(f.visibility, {}) as Record<
                string,
                boolean
              >;
              return (
                <Card key={String(f.id)}>
                  <div className="between">
                    <span className="family-avatar">
                      <FiUsers />
                    </span>
                    <Status value={String(f.status)} />
                  </div>
                  <h2>
                    {parent ? f.student_name : f.parent_name || f.invite_email}
                  </h2>
                  <p className="muted">
                    {parent ? t("student") : f.invite_email}
                  </p>
                  {!parent && f.status === "LINKED" && <div className="visibility-list">
                    {Object.entries(visibility).map(([key,value]) => <FormControlLabel key={key} label={t(key)} control={<Switch checked={value} onChange={(_,checked)=>run(()=>setStudentSharing({id:f.id,visibility:{...visibility,[key]:checked}}))}/>}/>)}
                  </div>}
                  {parent ? (
                    <>
                      <h3>{t("visibility")}</h3>
                      <div className="visibility-list">
                        {Object.entries(visibility).map(([key, value]) => (
                          <FormControlLabel
                            key={key}
                            control={
                              <Switch
                                checked={value}
                                onChange={(_, checked) =>
                                  run(() =>
                                    updateFamily({
                                      id: f.id,
                                      visibility: {
                                        ...visibility,
                                        [key]: checked,
                                      },
                                    }),
                                  )
                                }
                              />
                            }
                            label={t(key)}
                          />
                        ))}
                      </div>
                      <div className="button-group">
                        {f.status === "LINKED" && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelected(f);
                              setDialog("controls");
                            }}
                          >
                            {t("controls")}
                          </button>
                        )}
                        {f.status === "PENDING" && (
                          <button
                            className="button"
                            onClick={() =>
                              run(() =>
                                updateFamily({ id: f.id, status: "LINKED" }),
                              )
                            }
                          >
                            {t("confirmLink")}
                          </button>
                        )}
                        <button
                          className="button secondary"
                          onClick={() =>
                            run(() =>
                              updateFamily({ id: f.id, status: "REVOKED" }),
                            )
                          }
                        >
                          {t("unlink")}
                        </button>
                      </div>
                    </>
                  ) : (
                    f.status === "LINKED" && (
                      <>
                        <div className="detail-list">
                          {[
                            "threshold",
                            "per_transfer",
                            "daily_limit",
                            "monthly_limit",
                            "non_beneficiary_limit",
                          ].map((k) => (
                            <div key={k}>
                              <span>{t(k)}</span>
                              <b>
                                {formatMoney(
                                  Number(f[k]) * Number(data.rates.CNY),
                                  "CNY",
                                  locale,
                                )}
                              </b>
                            </div>
                          ))}
                        </div>
                        <p className="muted">{t("parentManaged")}</p>
                      </>
                    )
                  )}
                </Card>
              );
            })}
        </div>
      )}
      {showLinks && !data.family.length && (
        <Card>
          <Empty />
        </Card>
      )}
      {parent &&
        path === "parent/students" &&
        data.parentStudents.map((s) => (
          <Card key={String(s.link.id)}>
            <h2>{s.link.student_name}</h2>
            <div className="two-grid">
              <div>
                <h3>{t("balances")}</h3>
                <DataCards
                  rows={s.accounts}
                  columns={[{ key: "currency" }, { key: "balance" }]}
                />
              </div>
              <div>
                <h3>{t("tuition")}</h3>
                <DataCards
                  rows={s.tuition}
                  columns={[
                    { key: "name" },
                    { key: "amount" },
                    { key: "paid" },
                    { key: "due_date" },
                  ]}
                />
              </div>
            </div>
            <details>
              <summary>{t("transactions")}</summary>
              <DataCards
                rows={s.transactions}
                columns={[
                  { key: "category", render: (r) => t(String(r.category)) },
                  { key: "amount" },
                  { key: "currency" },
                  ...(s.transactions.some((r) => r.description)
                    ? [{ key: "description" }]
                    : []),
                ]}
              />
            </details>
            <details>
              <summary>{t("budgets")}</summary>
              <DataCards
                rows={s.budgets}
                columns={[
                  { key: "category", render: (r) => t(String(r.category)) },
                  { key: "amount" },
                  { key: "currency" },
                ]}
              />
            </details>
          </Card>
        ))}
      {parent && path === "parent/approvals" && (
        <Card>
          <h2>{t("transferApprovals")}</h2>
          <DataCards
            rows={data.approvals}
            columns={[
              { key: "student_name", label: "student" },
              { key: "recipient" },
              {
                key: "receive_amount",
                label: "amount",
                render: (r) =>
                  formatMoney(
                    String(r.receive_amount),
                    String(r.target_currency),
                    locale,
                  ),
              },
              {
                key: "status",
                render: (r) => <Status value={String(r.status)} />,
              },
            ]}
            actions={(r) =>
              r.status === "PENDING" ? (
                <div className="button-group">
                  <button
                    className="button small-button"
                    onClick={() => {
                      setSelected(r);
                      setDialog("APPROVED");
                    }}
                  >
                    <FiCheck />
                    {t("approve")}
                  </button>
                  <button
                    className="button secondary small-button"
                    onClick={() => {
                      setSelected(r);
                      setDialog("REJECTED");
                    }}
                  >
                    <FiX />
                    {t("reject")}
                  </button>
                </div>
              ) : (
                r.reason
              )
            }
          />
        </Card>
      )}
      {dialog === "invite" && (
        <FormDialog
          title="inviteStudent"
          fields={[{ name: "email", type: "email" }]}
          submit={(v) => inviteStudent(v.email)}
          after={(r) => setToken((r as { token: string }).token)}
          onClose={() => setDialog("")}
        />
      )}{" "}
      {dialog === "accept" && (
        <FormDialog
          title="acceptInvitation"
          fields={[{ name: "token", label: "invitationToken" }]}
          submit={(v) => acceptInvitation(v.token)}
          onClose={() => setDialog("")}
        />
      )}{" "}
      {token && (
        <Modal title={t("invitationToken")} onClose={() => setToken("")}>
          <p className="token-code">{token}</p>
          <button
            className="button"
            onClick={async () => {
              await navigator.clipboard.writeText(token);
              toast(t("success"));
            }}
          >
            {t("copy")}
          </button>
        </Modal>
      )}
      {dialog === "controls" && selected && (
        <FormDialog
          title="controls"
          fields={[
            ...[
              "threshold",
              "per_transfer",
              "daily_limit",
              "monthly_limit",
              "non_beneficiary_limit",
            ].map((name) => ({ name, type: "number", min: 0 })),
            ...[
              "tuition_approval",
              "conversion_approval",
              "auto_approve",
              "allow_non_beneficiary",
            ].map((name) => ({
              name,
              options: [
                { value: "1", label: "active" },
                { value: "0", label: "cancel" },
              ],
            })),
            ...["Shopping", "Food", "Other"].map((name) => ({
              name: `limit_${name}`,
              label: `limit_${name}`,
              type: "number",
              min: 0,
              required: false,
              help: "categoryLimitHelp",
            })),
          ]}
          initial={{
            ...Object.fromEntries(
              Object.entries(selected).map(([k, v]) => [
                k,
                [
                  "threshold",
                  "per_transfer",
                  "daily_limit",
                  "monthly_limit",
                  "non_beneficiary_limit",
                ].includes(k)
                  ? (Number(v) * Number(data.rates.CNY)).toFixed(2)
                  : String(v ?? ""),
              ]),
            ),
            ...Object.fromEntries(
              Object.entries(
                parseJson<Record<string, string>>(selected.category_limits, {}),
              ).map(([k, v]) => [
                `limit_${k}`,
                (Number(v) * Number(data.rates.CNY)).toFixed(2),
              ]),
            ),
          }}
          submit={(v) =>
            updateControls({
              ...v,
              link_id: selected.id,
              tuition_approval: v.tuition_approval === "1",
              conversion_approval: v.conversion_approval === "1",
              auto_approve: v.auto_approve === "1",
              allow_non_beneficiary: v.allow_non_beneficiary === "1",
              category_limits: Object.fromEntries(
                ["Shopping", "Food", "Other"]
                  .filter((k) => v[`limit_${k}`]?.trim())
                  .map((k) => [k, v[`limit_${k}`]]),
              ),
            })
          }
          onClose={() => setDialog("")}
        />
      )}{" "}
      {["APPROVED", "REJECTED"].includes(dialog) && selected && (
        <FormDialog
          title={dialog}
          fields={[{ name: "reason", type: "textarea" }]}
          submit={(v) =>
            decideApproval({
              id: selected.id,
              decision: dialog,
              reason: v.reason,
            })
          }
          onClose={() => setDialog("")}
        />
      )}
    </>
  );
}
