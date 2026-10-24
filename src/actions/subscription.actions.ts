"use server";
import { cancelUserRenewals } from "@/services/recurring.service";
import { effectiveSubscription } from "@/lib/entitlements";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
export async function activateStudentFree() {
  return action(async () => {
    const u = await requireUser("STUDENT");
    requireCondition(!u.is_demo, "DEMO_PLAN_LOCKED");
    await cancelUserRenewals(u.id);
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const [effective] = await effectiveSubscription(u.id, db);
      requireCondition(!effective?.sponsored_by, "FAMILY_PLAN_MANAGED");
      const [p] = await rows(
        "SELECT id FROM plans WHERE id='student-free' AND active=1",
        [],
        db,
      );
      requireCondition(p, "NOT_FOUND");
      await write(
        "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,'student-free','ACTIVE',UTC_TIMESTAMP(),'2099-12-31') ON DUPLICATE KEY UPDATE plan_id='student-free',status='ACTIVE',starts_at=UTC_TIMESTAMP(),ends_at='2099-12-31'",
        [randomUUID(), u.id],
        db,
      );
      await audit(
        u.id,
        "STUDENT_FREE_ACTIVATED",
        "subscriptions",
        u.id,
        {},
        db,
      );
    });
    return { status: "ACTIVE" };
  });
}
export async function cancelSubscription() {
  return action(async () => {
    const u = await requireUser();
    requireCondition(!u.is_demo, "DEMO_PLAN_LOCKED");
    await cancelUserRenewals(u.id);
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const [effective] = await effectiveSubscription(u.id, db);
      requireCondition(!effective?.sponsored_by, "FAMILY_PLAN_MANAGED");
      const [s] = await rows<{ plan_id: string; status: string }>(
        "SELECT plan_id,status FROM subscriptions WHERE user_id=?",
        [u.id],
        db,
      );
      requireCondition(s, "NOT_FOUND");
      if (s.status === "CANCELLED") return;
      await write(
        "UPDATE subscriptions SET status='CANCELLED' WHERE user_id=?",
        [u.id],
        db,
      );
      await write(
        "INSERT INTO subscription_events(id,user_id,plan_id,action,cycle) VALUES (?,?,?,'CANCELLED','—')",
        [randomUUID(), u.id, s.plan_id],
        db,
      );
      await audit(
        u.id,
        "SUBSCRIPTION_CANCELLED",
        "subscriptions",
        u.id,
        {},
        db,
      );
    });
    return null;
  });
}
