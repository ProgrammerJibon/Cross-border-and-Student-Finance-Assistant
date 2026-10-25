"use client";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/ui/providers";
import { Shell } from "./shell";
import type { User, Row } from "@/types";
export function WorkspaceFrame({
  user,
  notifications,
  children,
}: {
  user: User | null;
  notifications: Row[];
  children: React.ReactNode;
}) {
  const { t } = useApp();
  const path = usePathname().split("/").slice(2).join("/");
  if (
    !user ||
    [
      "",
      "features",
      "how-it-works",
      "security",
      "pricing",
      "about",
      "terms",
      "privacy",
      "login",
      "register",
      "forgot-password",
      "demo",
      "onboarding",
    ].includes(path)
  )
    return children;
  return (
    <Shell key={user.id} user={user} notifications={notifications}>
      {!!user.is_demo && <div className="notification-guidance" role="status">{t("demoEnvironmentNotice")}</div>}
      {children}
    </Shell>
  );
}
