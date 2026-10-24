"use client";
import { useApp } from "@/components/ui/providers";
export function FooterCredits() {
  const { t } = useApp();
  return (
    <span className="footer-credits">
      {t("developer")}: Jibon
      {" · "}
      {t("tester")}: Meher
    </span>
  );
}
