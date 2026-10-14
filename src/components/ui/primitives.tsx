"use client";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  LinearProgress,
  TextField,
  MenuItem,
} from "@mui/material";
import { FiArrowUpRight, FiInbox, FiX, FiDownload } from "react-icons/fi";
import { useApp } from "./providers";
import type { Result, Row } from "@/types";
export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  const { t } = useApp();
  return (
    <Badge
      tone={
        /FAILED|CRITICAL|REJECT|BLOCK|SUSPEND/.test(value)
          ? "red"
          : /WAIT|PENDING|DRAFT|WARNING|HIGH|INVITED/.test(value)
            ? "amber"
            : "green"
      }
    >
      {t(value)}
    </Badge>
  );
}
export function Empty() {
  const { t } = useApp();
  return (
    <div className="empty">
      <FiInbox />
      <h3>{t("empty")}</h3>
      <p>{t("emptyBody")}</p>
    </div>
  );
}
export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <LinearProgress
      variant="determinate"
      value={Math.max(0, Math.min(100, value))}
      sx={{
        height: 7,
        borderRadius: 5,
        backgroundColor: "var(--track)",
        "& .MuiLinearProgress-bar": {
          borderRadius: 5,
          backgroundColor: color || "var(--accent)",
        },
      }}
    />
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
  color = "green",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  color?: string;
}) {
  return (
    <Card className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          {icon || <FiArrowUpRight />}
        </span>
      </div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">{note}</div>
    </Card>
  );
}
export type Field = {
  name: string;
  label?: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  help?: string;
};
export function FormFields({
  fields,
  values,
  setValues,
}: {
  fields: Field[];
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const { t, catalog } = useApp();
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <TextField
          key={f.name}
          label={t(f.label || f.name)}
          value={values[f.name] ?? ""}
          onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          select={!!f.options}
          type={f.type || "text"}
          required={f.required !== false}
          fullWidth
          multiline={f.type === "textarea"}
          minRows={f.type === "textarea" ? 3 : undefined}
          helperText={f.help ? t(f.help) : undefined}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: {
              min: f.min,
              max: f.max,
              step: f.step || "any",
              maxLength: f.type === "textarea" ? 4000 : 500,
            },
          }}
        >
          {(f.options &&
          [
            "currency",
            "currency_code",
            "preferred_currency",
            "home_currency",
            "study_currency",
            "source",
            "target",
          ].includes(f.name)
            ? catalog.currencies.map((c) => ({
                value: c.code,
                label: c.code === "CNY" ? "RMB (CNY)" : c.code,
              }))
            : f.options
          )?.map((o) => (
            <MenuItem value={o.value} key={o.value}>
              {t(o.label)}
            </MenuItem>
          ))}
        </TextField>
      ))}
    </div>
  );
}
export function FormDialog({
  title,
  fields,
  initial,
  submit,
  onClose,
  after,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, string>;
  submit: (v: Record<string, string>) => Promise<Result<unknown>>;
  onClose: () => void;
  after?: (r: unknown) => void;
}) {
  const { t, run } = useApp();
  const [values, setValues] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await run(() => submit(values));
          setBusy(false);
          if (r !== undefined) {
            after?.(r);
            onClose();
          }
        }}
      >
        <DialogTitle>{t(title)}</DialogTitle>
        <DialogContent>
          <div className="dialog-fields">
            <FormFields fields={fields} values={values} setValues={setValues} />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={20} /> : t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t } = useApp();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={wide ? "md" : "sm"}>
      <DialogTitle className="modal-title">
        {title}
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <FiX />
        </button>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}
export function DataCards({
  rows,
  columns,
  actions,
}: {
  rows: Row[];
  columns: { key: string; label?: string; render?: (row: Row) => ReactNode }[];
  actions?: (row: Row) => ReactNode;
}) {
  const { t } = useApp();
  if (!rows.length) return <Empty />;
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{t(c.label || c.key)}</th>
            ))}
            {actions && (
              <th>
                <span className="sr-only">{t("quickAction")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id || i)}>
              {columns.map((c) => (
                <td key={c.key} data-label={t(c.label || c.key)}>
                  {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                </td>
              ))}
              {actions && <td className="table-actions">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ExportButton({
  data,
  name = "evidence",
}: {
  data: unknown;
  name?: string;
}) {
  const { t } = useApp();
  return (
    <button
      className="button secondary"
      onClick={() => downloadJson(data, name)}
    >
      <FiDownload />
      {t("export")}
    </button>
  );
}
