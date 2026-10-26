"use client";
import { usePathname } from "next/navigation";
import { Shell } from "./shell";
import type { User, Row } from "@/types";
import { DashboardGuidance, PageGuidance } from "@/components/ui/dashboard-guidance";
export function WorkspaceFrame({
  user,
  notifications,
  children,
}: {
  user: User | null;
  notifications: Row[];
  children: React.ReactNode;
}) {
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
    <DashboardGuidance path={path}><Shell key={user.id} user={user} notifications={notifications}>
      {children}
      <PageGuidance path={path}/>
    </Shell></DashboardGuidance>
  );
}
