import { rows, write, type DB } from "./db";
import { requireCondition } from "./errors";
import type { Feature } from "@/types";
import { familySeats } from "./plan-policy";
import { effectiveSubscription } from "./entitlements";
export function subscriptionActive(
  status: string,
  end: string,
  now = Date.now(),
) {
  return (
    status === "ACTIVE" &&
    new Date(end.replace(" ", "T") + (end.includes("Z") ? "" : "Z")).getTime() >
      now
  );
}
export function withinLimit(used: number, limit: number) {
  return Number.isFinite(limit) && used < limit;
}
export async function checkUsageLimit(
  userId: string,
  feature: Feature,
  db: DB,
  budgetMonth?: string,
) {
  const [user] = await rows<{ status: string }>(
    "SELECT status FROM users WHERE id=? FOR UPDATE",
    [userId],
    db,
  );
  requireCondition(user?.status === "ACTIVE", "FORBIDDEN");
  const [s] = await effectiveSubscription(userId, db);
  requireCondition(
    s && subscriptionActive(String(s.status), String(s.ends_at)),
    "SUBSCRIPTION_EXPIRED",
  );
  const limits = typeof s.limits === "string" ? JSON.parse(s.limits) : {};
  const [counter] = await rows<{ used: number }>(
    "SELECT used FROM usage_counters WHERE user_id=? AND feature=? AND period=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m')",
    [userId, feature],
    db,
  );
  let used = counter?.used || 0;
  if (feature === "ACCOUNTS") {
    const [r] = await rows<{ n: number }>(
      "SELECT COUNT(*) n FROM accounts WHERE user_id=? AND archived=0",
      [userId],
      db,
    );
    used = r.n;
  }
  if (feature === "PARENT_LINKS") {
    const [r] = await rows<{ n: number }>(
      "SELECT COUNT(*) n FROM family_links WHERE (student_id=? OR parent_id=?) AND (status IN ('LINKED','PENDING') OR (status='INVITED' AND expires_at>UTC_TIMESTAMP()))",
      [userId, userId],
      db,
    );
    used = r.n;
  }
  if (feature === "BENEFICIARIES" || feature === "BUDGETS") {
    const [r] = await rows<{ n: number }>(feature === "BENEFICIARIES"
      ? "SELECT COUNT(*) n FROM beneficiaries WHERE user_id=? AND status NOT IN ('REMOVED','REJECTED')"
      : "SELECT COUNT(*) n FROM budgets WHERE user_id=? AND month=?", feature === "BUDGETS" ? [userId,budgetMonth || new Date().toISOString().slice(0,7)] : [userId], db);
    used = r.n;
  }
  requireCondition(
    withinLimit(
      used,
      feature === "PARENT_LINKS"
        ? (String(s.plan_id).startsWith("family") ? familySeats(String(s.plan_id), Number(s.extra_seats || 0)).total : limits[feature])
        : limits[feature],
    ),
    "PLAN_LIMIT_REACHED",
  );
}
export async function incrementUsage(userId: string, feature: Feature, db: DB) {
  await write(
    "INSERT INTO usage_counters(user_id,feature,period,used) VALUES (?,?,DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m'),1) ON DUPLICATE KEY UPDATE used=used+1",
    [userId, feature],
    db,
  );
}
