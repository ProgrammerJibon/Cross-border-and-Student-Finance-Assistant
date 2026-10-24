import "server-only";
import { rows, type DB } from "./db";
import { requireCondition } from "./errors";
import type { Row } from "@/types";
import { familyPlans, familySeats } from "./plan-policy";

// Resolve on every request: family membership and expiry must never be cached.
export async function effectiveSubscription(
  userId: string,
  db?: DB,
): Promise<Row[]> {
  const [user] = await rows<{ role: string; is_demo: number }>(
    "SELECT role,is_demo FROM users WHERE id=?",
    [userId],
    db,
  );
  if (!user) return [];
  const own = await rows(
    "SELECT s.*,p.name,p.limits,pr.monthly,pr.currency FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN plan_prices pr ON pr.plan_id=p.id WHERE s.user_id=? AND s.status='ACTIVE' AND s.ends_at>UTC_TIMESTAMP() AND p.active=1",
    [userId],
    db,
  );
  let plan = "";
  let sponsor: Row | undefined;
  if (user.role === "STUDENT") {
    [sponsor] = await rows(
      "SELECT s.ends_at,s.plan_id,s.extra_seats,f.parent_id,f.id link_id FROM family_links f JOIN subscriptions s ON s.user_id=f.parent_id JOIN users u ON u.id=f.parent_id WHERE f.student_id=? AND f.status='LINKED' AND u.status='ACTIVE' AND s.plan_id IN ('family','family-pro') AND s.status='ACTIVE' AND s.ends_at>UTC_TIMESTAMP() ORDER BY s.ends_at DESC LIMIT 1",
      [userId],
      db,
    );
    if (sponsor) {
      const members = await rows("SELECT id FROM family_links WHERE parent_id=? AND status='LINKED' ORDER BY created_at,id", [sponsor.parent_id], db);
      if (members.findIndex((f) => f.id === sponsor!.link_id) >= familySeats(String(sponsor.plan_id), Number(sponsor.extra_seats || 0)).pro) sponsor = undefined;
    }
    if (sponsor) plan = "student";
    else if (
      !own.length ||
      !["student", "pro"].includes(String(own[0].plan_id))
    )
      plan = "student-free";
  }
  if (user.role === "PARENT")
    return own.filter((s) => familyPlans.includes(String(s.plan_id)));
  if (!plan) return own;
  const [p] = await rows(
    "SELECT p.name,p.limits,pr.monthly,pr.currency FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id WHERE p.id=? AND p.active=1",
    [plan],
    db,
  );
  return p
    ? [
        {
          ...p,
          user_id: userId,
          plan_id: plan,
          status: "ACTIVE",
          ends_at: sponsor?.ends_at || "2099-12-31 00:00:00",
          sponsored_by: sponsor?.parent_id || null,
          monthly: sponsor || user.is_demo ? "0" : p.monthly,
        },
      ]
    : [];
}

export async function requireFamilyPlan(userId: string, db?: DB) {
  const [subscription] = await effectiveSubscription(userId, db);
  requireCondition(familyPlans.includes(String(subscription?.plan_id)), "FAMILY_PLAN_REQUIRED");
}

export async function requireFamilyStudent(
  studentId: string,
  linkId: string,
  db: DB,
) {
  const [student] = await rows<{
    is_demo: number;
    role: string;
    status: string;
  }>(
    "SELECT is_demo,role,status FROM users WHERE id=? FOR UPDATE",
    [studentId],
    db,
  );
  requireCondition(
    student?.role === "STUDENT" &&
      student.status === "ACTIVE",
    "FORBIDDEN",
  );
  const [parent] = await rows<{is_demo:number}>("SELECT u.is_demo FROM users u JOIN family_links f ON f.parent_id=u.id WHERE f.id=?",[linkId],db);
  requireCondition(parent && parent.is_demo === student.is_demo, "FORBIDDEN");
  const links = await rows(
    "SELECT id FROM family_links WHERE student_id=? AND status='LINKED' AND id<>? FOR UPDATE",
    [studentId, linkId],
    db,
  );
  requireCondition(!links.length, "FAMILY_ALREADY_LINKED");
}

export async function requirePlanPurchase(
  userId: string,
  plan: string,
  db?: DB,
) {
  const [u] = await rows<{ role: string; is_demo: number }>(
    "SELECT role,is_demo FROM users WHERE id=?",
    [userId],
    db,
  );
  requireCondition(u && !u.is_demo, "DEMO_PLAN_LOCKED");
  requireCondition(
    u.role === "PARENT"
      ? familyPlans.includes(plan)
      : u.role === "STUDENT" && plan === "student",
    "PLAN_NOT_ALLOWED",
  );
  const [subscription] = await effectiveSubscription(userId, db);
  requireCondition(!subscription?.sponsored_by, "FAMILY_PLAN_MANAGED");
}
