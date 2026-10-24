import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const { rows, write, atomic, pool } = await import("../src/lib/db");
const { effectiveSubscription, requireFamilyPlan, requirePlanPurchase } =
  await import("../src/lib/entitlements");
const { checkUsageLimit } = await import("../src/lib/plan-limits");

test("paid family seats, immediate revocation, expiry, demo locks and Free feature limits", async () => {
  const prefix = `ent-${randomUUID().slice(0, 8)}`;
  const parent = `${prefix}-p`,
    demo = `${prefix}-demo`;
  const students = Array.from({ length: 11 }, (_, i) => `${prefix}-s${i}`);
  const users = [parent, demo, ...students];
  try {
    for (const id of users) {
      await write(
        "INSERT INTO users(id,name,email,password_hash,role,is_demo) VALUES (?,?,?,'test-only',?,?)",
        [
          id,
          id,
          `${id}@example.test`,
          id === parent ? "PARENT" : "STUDENT",
          id === demo,
        ],
      );
      if (id !== parent)
        await write(
          "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,'student-free','ACTIVE',UTC_TIMESTAMP(),'2099-12-31')",
          [randomUUID(), id],
        );
    }
    await assert.rejects(requireFamilyPlan(parent), {
      message: "FAMILY_PLAN_REQUIRED",
    });
    await assert.rejects(requirePlanPurchase(demo, "student"), {
      message: "DEMO_PLAN_LOCKED",
    });
    await assert.rejects(requirePlanPurchase(parent, "student"), {
      message: "PLAN_NOT_ALLOWED",
    });
    await assert.rejects(requirePlanPurchase(students[0], "family"), {
      message: "PLAN_NOT_ALLOWED",
    });
    await requirePlanPurchase(students[0], "student");
    await assert.rejects(
      atomic((db) => checkUsageLimit(students[0], "CSV_IMPORTS", db)),
      { message: "PLAN_LIMIT_REACHED" },
    );
    await write(
      "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,'family','ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))",
      [randomUUID(), parent],
    );
    await requireFamilyPlan(parent);
    for (const student of students.slice(0, 10))
      await atomic(async (db) => {
        await checkUsageLimit(parent, "PARENT_LINKS", db);
        await write(
          "INSERT INTO family_links(id,student_id,parent_id,status,invited_by,visibility) VALUES (?,?,?,'LINKED','PARENT','{}')",
          [`${prefix}-link-${String(students.indexOf(student)).padStart(2,"0")}`, student, parent],
          db,
        );
      });
    await assert.rejects(
      atomic((db) => checkUsageLimit(parent, "PARENT_LINKS", db)),
      { message: "PLAN_LIMIT_REACHED" },
    );
    for (const student of students.slice(5, 10)) assert.equal((await effectiveSubscription(student))[0].plan_id, "student-free");
    for (const student of students.slice(0, 5)) {
      const [sub] = await effectiveSubscription(student);
      assert.equal(sub.plan_id, "student");
      assert.equal(sub.monthly, "0");
      assert.equal(sub.sponsored_by, parent);
      await atomic((db) => checkUsageLimit(student, "CSV_IMPORTS", db));
    }
    await assert.rejects(requirePlanPurchase(students[0], "student"), {
      message: "FAMILY_PLAN_MANAGED",
    });
    await write("UPDATE family_links SET status='REVOKED' WHERE student_id=?", [
      students[0],
    ]);
    assert.equal(
      (await effectiveSubscription(students[0]))[0].plan_id,
      "student-free",
    );
    await atomic((db) => checkUsageLimit(parent, "PARENT_LINKS", db));
    await write(
      "UPDATE subscriptions SET ends_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?",
      [parent],
    );
    assert.equal(
      (await effectiveSubscription(students[1]))[0].plan_id,
      "student-free",
    );
    await assert.rejects(requireFamilyPlan(parent), {
      message: "FAMILY_PLAN_REQUIRED",
    });
    await write("UPDATE subscriptions SET plan_id='student' WHERE user_id=?", [
      demo,
    ]);
    assert.equal(
      (await effectiveSubscription(demo))[0].plan_id,
      "student",
    );
    const [stored] = await rows(
      "SELECT plan_id FROM subscriptions WHERE user_id=?",
      [students[0]],
    );
    assert.equal(stored.plan_id, "student-free");
  } finally {
    for (const id of users) {
      await write(
        "DELETE FROM family_links WHERE student_id=? OR parent_id=?",
        [id, id],
      );
      await write("DELETE FROM subscriptions WHERE user_id=?", [id]);
      await write("DELETE FROM users WHERE id=?", [id]);
    }
    await pool.end();
  }
});
