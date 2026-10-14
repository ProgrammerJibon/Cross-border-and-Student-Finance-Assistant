export const adminSections = [
  "users",
  "plans",
  "subscriptions",
  "reports",
  "risk",
  "agent",
  "finance",
  "audit",
  "catalog",
  "models",
  "team",
  "settlements",
  "payment-methods",
] as const;
export type AdminSection = (typeof adminSections)[number];
export function hasPermission(
  user: { role: string; admin_permissions?: string | null },
  section: string,
) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "MODERATOR") return false;
  try {
    const permissions = JSON.parse(user.admin_permissions || "[]");
    return Array.isArray(permissions) && permissions.includes(section);
  } catch {
    return false;
  }
}
