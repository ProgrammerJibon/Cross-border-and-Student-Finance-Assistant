"use client";
import { MenuItem, Select } from "@mui/material";
import type { Locale } from "@/lib/config";

function Flag({ locale }: { locale: Locale }) {
  return (
    <svg
      viewBox="0 0 30 20"
      width="24"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      {locale === "bn-BD" ? (
        <>
          <path fill="#006a4e" d="M0 0h30v20H0z" />
          <circle fill="#f42a41" cx="13.5" cy="10" r="6" />
        </>
      ) : locale === "zh-CN" ? (
        <>
          <path fill="#de2910" d="M0 0h30v20H0z" />
          <g fill="#ffde00">
            <path d="m5 2 1.1 3.1h3.3L6.7 7l1 3.1L5 8.2l-2.7 1.9L3.3 7 .6 5.1h3.3z" />
            <path d="m10 1 .4 1.1h1.2l-1 .7.4 1.1-1-.7-1 .7.4-1.1-1-.7h1.2zm3 3 .4 1.1h1.2l-1 .7.4 1.1-1-.7-1 .7.4-1.1-1-.7h1.2zm0 4 .4 1.1h1.2l-1 .7.4 1.1-1-.7-1 .7.4-1.1-1-.7h1.2zm-3 3 .4 1.1h1.2l-1 .7.4 1.1-1-.7-1 .7.4-1.1-1-.7h1.2z" />
          </g>
        </>
      ) : (
        <>
          <path fill="#fff" d="M0 0h30v20H0z" />
          <path
            stroke="#b22234"
            strokeWidth="1.54"
            d="M0 .77h30M0 3.85h30M0 6.93h30M0 10h30M0 13.08h30M0 16.16h30M0 19.23h30"
          />
          <path fill="#3c3b6e" d="M0 0h13v10.77H0z" />
          <g fill="#fff">
            {Array.from({ length: 9 }, (_, row) =>
              Array.from({ length: row % 2 ? 5 : 6 }, (_, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={1.1 + col * 2.15 + (row % 2 ? 1.07 : 0)}
                  cy={1 + row * 1.1}
                  r=".42"
                />
              )),
            )}
          </g>
        </>
      )}
    </svg>
  );
}
const languages: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "zh-CN", label: "中文" },
  { value: "bn-BD", label: "বাংলা" },
];
export function LanguagePicker({
  locale,
  label,
  onChange,
}: {
  locale: Locale;
  label: string;
  onChange: (value: Locale) => void;
}) {
  return (
    <Select
      size="small"
      className="language-select"
      sx={{
        minWidth: 82,
        width: "auto",
        padding: 0,
        "& fieldset": { border: "0 !important" },
        "&.Mui-focused": { backgroundColor: "action.hover" },
        "& .MuiSelect-select": { py: 0.8, pl: 1, pr: "28px !important" },
      }}
      value={locale}
      inputProps={{ "aria-label": label }}
      onChange={(e) => onChange(e.target.value as Locale)}
      renderValue={(value) => (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Flag locale={value as Locale} />
          {languages.find((l) => l.value === value)?.label}
        </span>
      )}
    >
      {languages.map((l) => (
        <MenuItem key={l.value} value={l.value} sx={{ gap: 1 }}>
          <Flag locale={l.value} />
          {l.label}
        </MenuItem>
      ))}
    </Select>
  );
}
