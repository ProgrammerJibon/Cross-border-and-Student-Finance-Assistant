"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiArrowRight } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { demoProfiles, enterDemo, resetDemoUsers } from "@/actions/demo.actions";
import { PlanIcon } from "@/components/billing/plan-icon";
import type { Row } from "@/types";

export function DemoProfiles() {
  const { t, locale, run } = useApp();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void demoProfiles().then((r) => {
      if (r.success) setProfiles(r.data);
      else setError(r.code);
    });
  }, []);

  return (
    <>
      {profiles.map((p) => (
        <button
          className="demo-profile"
          key={String(p.id)}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await run(() => enterDemo(p.id), {
              quiet: true,
              refresh: false,
            });
            if (result) {
              router.push(
                `/${locale}/${["ADMIN", "MODERATOR"].includes(result.role) ? "admin" : result.role === "PARENT" ? "parent" : "dashboard"}`,
              );
              router.refresh();
            }
            setBusy(false);
          }}
        >
          <span className="demo-profile-icon" aria-hidden="true">
            <PlanIcon
              planId={String(p.plan_id || p.role)}
              role={String(p.role)}
              size={24}
            />
          </span>
          <div>
            <h3>
              {["ADMIN", "MODERATOR"].includes(String(p.role))
                ? t(String(p.role))
                : t(String(p.plan))}
            </h3>
            <p>{p.name}</p>
          </div>
          <FiArrowRight aria-hidden="true" />
        </button>
      ))}
      {error && <p role="alert">{t(error)}</p>}
    </>
  );
}

export function DemoResetButton() {
  const { t, run } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button secondary small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await run(resetDemoUsers);
        setBusy(false);
      }}
    >
      {t(busy ? "loading" : "resetDemoUsers")}
    </button>
  );
}
