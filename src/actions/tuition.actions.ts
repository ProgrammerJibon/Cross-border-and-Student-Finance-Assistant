"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, write, rows } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { tuitionSchema, amount, id } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
export async function saveTuition(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = tuitionSchema
      .refine((v) => Number(v.paid) + Number(v.scholarship) <= Number(v.amount))
      .parse(input);
    requireCondition(u.is_demo || Number(v.paid) === 0, "UNVERIFIED_TUITION_PAYMENT");
    return atomic(async (db) => {
      const key = v.id || randomUUID();
      if (v.id) {
        const r = await write(
          "UPDATE tuition_invoices SET name=?,amount=?,currency=?,due_date=?,scholarship=?,semester=? WHERE id=? AND user_id=?",
          [
            v.name,
            v.amount,
            v.currency,
            v.due_date,
            v.scholarship,
            v.semester,
            key,
            u.id,
          ],
          db,
        );
        requireCondition(r.affectedRows, "NOT_FOUND");
      } else {
        await checkUsageLimit(u.id, "TUITION_PLANS", db);
        await write(
          "INSERT INTO tuition_invoices(id,user_id,name,amount,paid,scholarship,currency,due_date,semester) VALUES (?,?,?,?,?,?,?,?,?)",
          [
            key,
            u.id,
            v.name,
            v.amount,
            v.paid,
            v.scholarship,
            v.currency,
            v.due_date,
            v.semester,
          ],
          db,
        );
        await incrementUsage(u.id, "TUITION_PLANS", db);
      }
      await audit(u.id, "TUITION_SAVED", "tuition_invoices", key, {}, db);
      return { id: key };
    });
  });
}
export async function saveFundingPlan(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = z
      .object({
        invoice_id: id,
        monthly_target: amount,
        scenario: z.record(z.string(), z.number().finite()),
      })
      .parse(input);
    return atomic(async (db) => {
      requireCondition(
        (
          await rows(
            "SELECT id FROM tuition_invoices WHERE id=? AND user_id=?",
            [v.invoice_id, u.id],
            db,
          )
        ).length,
        "NOT_FOUND",
      );
      await write(
        "INSERT INTO tuition_plans(id,user_id,invoice_id,monthly_target,scenario) VALUES (?,?,?,?,?)",
        [
          randomUUID(),
          u.id,
          v.invoice_id,
          v.monthly_target,
          JSON.stringify(v.scenario),
        ],
        db,
      );
      await audit(
        u.id,
        "FUNDING_PLAN_SAVED",
        "tuition_invoices",
        v.invoice_id,
        {},
        db,
      );
      return null;
    });
  });
}
