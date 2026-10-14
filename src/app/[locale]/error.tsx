"use client";
import { useApp } from "@/components/ui/providers";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useApp();
  return (
    <div className="setup-error">
      <h1>{t("errorTitle")}</h1>
      <p>{t("databaseUnavailable")}</p>
      <button className="button" onClick={reset}>
        {t("retry")}
      </button>
    </div>
  );
}
