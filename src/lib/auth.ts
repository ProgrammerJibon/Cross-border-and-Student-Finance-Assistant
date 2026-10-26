import "server-only";
import { rows } from "./db";
import { sessionPayload } from "./session";
import { AppError } from "./errors";
import type { Role, User } from "@/types";
import { hasPermission, type AdminSection } from "./admin-permissions";
import { effectiveSubscription, requireFamilyPlan } from "./entitlements";
export async function currentUser(): Promise<User | null> {
  const p = await sessionPayload();
  if (!p?.sub) return null;
  const [u] = await rows<User & { status: string }>(
    "SELECT u.id,u.name,u.email,u.role,u.status,u.session_version,u.is_demo,u.onboarded,u.avatar,u.admin_permissions,u.must_rotate_password,u.mfa_enabled,p.country_code,p.ai_model_id,p.language,p.theme,p.preferred_currency,p.timezone,p.notifications,p.auto_alerts FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?",
    [p.sub],
  );
  if (u) u.plan_id = String((await effectiveSubscription(u.id))[0]?.plan_id || "");
  return u && u.status === "ACTIVE" && u.session_version === p.version && (!u.mfa_enabled || p.mfa === true)
    ? u
    : null;
}
export async function requireAdmin(section: AdminSection) {
  const user = await requireUser();
  if (!hasPermission(user, section)) throw new AppError("FORBIDDEN");
  return user;
}
export async function requireLiveAdmin(section: AdminSection) {
  const user = await requireAdmin(section);
  if (user.is_demo) throw new AppError("LIVE_ADMIN_REQUIRED");
  return user;
}
export async function requireUser(role?: Role) {
  const u = await currentUser();
  if (!u) throw new AppError("UNAUTHORIZED");
  if (role && u.role !== role) throw new AppError("FORBIDDEN");
  return u;
}
export async function requireWorkspaceUser(role?: Role) {
  const user = await requireUser(role);
  if (user.role === "PARENT") await requireFamilyPlan(user.id);
  return user;
}
