import { rows, write, type DB } from "./db";
import { requireCondition } from "./errors";
import type { Feature } from "@/types";
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
) {
  const [user] = await rows<{ status: string }>(
    "SELECT status FROM users WHERE id=? FOR UPDATE",
    [userId],
    db,
  );
  requireCondition(user?.status === "ACTIVE", "FORBIDDEN");
  const [s] = await rows<{ status: string; ends_at: string; limits: string }>(
    "SELECT s.status,s.ends_at,p.limits FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=?",
    [userId],
    db,
  );
  requireCondition(
    s && subscriptionActive(s.status, s.ends_at),
    "SUBSCRIPTION_EXPIRED",
  );
  const limits = typeof s.limits === "string" ? JSON.parse(s.limits) : s.limits;
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
      "SELECT COUNT(*) n FROM family_links WHERE (student_id=? OR parent_id=?) AND status<>'REVOKED'",
      [userId, userId],
      db,
    );
    used = r.n;
  }
  requireCondition(withinLimit(used, limits[feature]), "PLAN_LIMIT_REACHED");
}
export async function incrementUsage(userId: string, feature: Feature, db: DB) {
  await write(
    "INSERT INTO usage_counters(user_id,feature,period,used) VALUES (?,?,DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m'),1) ON DUPLICATE KEY UPDATE used=used+1",
    [userId, feature],
    db,
  );
}
