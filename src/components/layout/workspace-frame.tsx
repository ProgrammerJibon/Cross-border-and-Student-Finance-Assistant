"use client";
import { usePathname } from "next/navigation";
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
    <Shell user={user} notifications={notifications}>
      {children}
    </Shell>
  );
}
