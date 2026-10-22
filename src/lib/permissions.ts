import type { Role } from "@/types";
import { hasPermission } from "./admin-permissions";
export function canOpen(
  role: Role,
  path: string,
  admin_permissions: string | null = null,
) {
  if (path === "agent") return ["STUDENT", "PARENT", "ADMIN"].includes(role);
  if (path === "api-keys") return true;
  if (
    ["payments", "beneficiaries", "money", "transactions", "agent"].includes(
      path,
    )
  )
    return ["STUDENT", "PARENT"].includes(role);
  if (role === "MODERATOR" && path.startsWith("admin"))
    return (
      path === "admin" ||
      path === "admin/settings" ||
      hasPermission({ role, admin_permissions }, path.split("/")[1])
    );
  if (path.startsWith("admin") || path === "project-evidence")
    return role === "ADMIN";
  if (path.startsWith("parent")) return role === "PARENT";
  if (
    [
      "settings",
      "subscription",
      "subscription/checkout",
      "reports",
      "security-assessment",
      "activity",
      "alerts",
    ].includes(path)
  )
    return true;
  return role === "STUDENT";
}
