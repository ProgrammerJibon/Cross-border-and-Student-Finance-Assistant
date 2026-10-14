"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import {
  amount,
  nonnegative,
  currency,
  day,
  shortText,
} from "@/lib/validation";
import { audit } from "@/lib/audit";
import { clearSession } from "@/lib/session";
export async function completeOnboarding(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = z
      .object({
        name: shortText,
        birth_date: day,
        student_status: shortText,
        university: shortText,
        home_country: shortText,
        study_country: shortText,
        home_currency: currency,
        study_currency: currency,
        preferred_currency: currency,
        tuition: amount,
        paid: nonnegative,
        scholarship: nonnegative,
        due_date: day,
        semester: shortText,
        balance: nonnegative,
        income: nonnegative,
        expenses: nonnegative,
        goals: z.array(z.string().max(40)).max(5),
      })
      .refine(
        (v) => Number(v.paid) + Number(v.scholarship) <= Number(v.tuition),
      )
      .parse(input);
    return atomic(async (db) => {
      const [fresh] = await rows<{ onboarded: number }>(
        "SELECT onboarded FROM users WHERE id=? FOR UPDATE",
        [u.id],
        db,
      );
      requireCondition(!fresh.onboarded, "INVALID_STATE");
      await write(
        "UPDATE users SET name=?,onboarded=1 WHERE id=?",
        [v.name, u.id],
        db,
      );
      await write(
        "UPDATE student_profiles SET birth_date=?,student_status=?,university=?,home_country=?,study_country=?,home_currency=?,study_currency=?,monthly_income=?,monthly_expenses=?,goals=? WHERE user_id=?",
        [
          v.birth_date,
          v.student_status,
          v.university,
          v.home_country,
          v.study_country,
          v.home_currency,
          v.study_currency,
          v.income,
          v.expenses,
          JSON.stringify(v.goals),
          u.id,
        ],
        db,
      );
      await write(
        "UPDATE user_preferences SET preferred_currency=? WHERE user_id=?",
        [v.preferred_currency, u.id],
        db,
      );
      await write(
        "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,?,'BANK',?,?)",
        [randomUUID(), u.id, v.name, v.study_currency, v.balance],
        db,
      );
      await write(
        "INSERT INTO tuition_invoices(id,user_id,name,amount,paid,scholarship,currency,due_date,semester) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          u.id,
          v.university,
          v.tuition,
          v.paid,
          v.scholarship,
          v.study_currency,
          v.due_date,
          v.semester,
        ],
        db,
      );
      await audit(u.id, "ONBOARDING_COMPLETE", "users", u.id, {}, db);
      return null;
    });
  });
}
export async function updateProfile(name: string) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(u.role !== "MODERATOR", "FORBIDDEN");
    shortText.parse(name);
    await write("UPDATE users SET name=? WHERE id=?", [name, u.id]);
    return null;
  });
}
export async function exportMyData() {
  return action(async () => {
    const u = await requireUser();
    const data: Record<string, unknown> = {
      profile: { name: u.name, email: u.email, role: u.role },
    };
    for (const table of [
      "user_preferences",
      "accounts",
      "transactions",
      "budgets",
      "tuition_invoices",
      "sandbox_transfers",
      "agent_runs",
      "reports",
      "demo_payments",
      "financial_requests",
      "beneficiaries",
      "agent_action_requests",
    ])
      data[table] = await rows(
        `SELECT * FROM ${table} WHERE user_id=? LIMIT 10000`,
        [u.id],
      );
    return data;
  });
}
export async function closeAccount(confirmation: string) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(confirmation === u.email, "VALIDATION_ERROR");
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      requireCondition(
        !(
          await rows(
            "SELECT id FROM financial_requests WHERE user_id=? AND status IN ('WAITING_PARENT','QUEUED','PROCESSING') LIMIT 1",
            [u.id],
            db,
          )
        ).length,
        "PENDING_PAYMENTS",
      );
      await write(
        "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id=?",
        [u.id],
        db,
      );
      await write(
        "UPDATE family_links SET status='REVOKED' WHERE student_id=? OR parent_id=?",
        [u.id, u.id],
        db,
      );
      await audit(u.id, "ACCOUNT_CLOSED", "users", u.id, {}, db);
    });
    await clearSession();
    return null;
  });
}
export async function clearDemoData(confirmation: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    requireCondition(u.is_demo && confirmation === u.email, "FORBIDDEN");
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      requireCondition(
        !(
          await rows(
            "SELECT id FROM financial_requests WHERE user_id=? AND status IN ('WAITING_PARENT','QUEUED','PROCESSING') LIMIT 1",
            [u.id],
            db,
          )
        ).length,
        "PENDING_PAYMENTS",
      );
      await write("DELETE FROM transactions WHERE user_id=?", [u.id], db);
      await write("DELETE FROM budgets WHERE user_id=?", [u.id], db);
      await write("UPDATE accounts SET balance=0 WHERE user_id=?", [u.id], db);
      await write("DELETE FROM generated_alerts WHERE user_id=?", [u.id], db);
      await write("DELETE FROM alerts WHERE user_id=?", [u.id], db);
      await audit(
        u.id,
        "DEMO_DATA_CLEARED",
        "users",
        u.id,
        { retained: "Immutable transfer and approval evidence retained" },
        db,
      );
    });
    return null;
  });
}
