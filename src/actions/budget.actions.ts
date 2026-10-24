"use server";
import { checkUsageLimit } from "@/lib/plan-limits";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { atomic, write, rows } from "@/lib/db";
import { z } from "zod";
import { validCurrency } from "@/lib/catalog";
import { action, requireCondition } from "@/lib/errors";
import { parseJson } from "@/lib/json";
import { budgetSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
export async function saveBudget(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = budgetSchema.parse(input);
    return atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const key = v.id || randomUUID();
      if (v.id) {
        const r = await write(
          "UPDATE budgets SET category=?,amount=?,currency=?,month=? WHERE id=? AND user_id=?",
          [v.category, v.amount, v.currency, v.month, v.id, u.id],
          db,
        );
        requireCondition(r.affectedRows, "NOT_FOUND");
      } else {
        const [existing] = await rows("SELECT id FROM budgets WHERE user_id=? AND category=? AND month=?", [u.id, v.category, v.month], db);
        if (!existing) await checkUsageLimit(u.id, "BUDGETS", db, v.month);
        await write(
          "INSERT INTO budgets(id,user_id,category,amount,currency,month) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount)",
          [key, u.id, v.category, v.amount, v.currency, v.month],
          db,
        );
      }
      await audit(u.id, "BUDGET_SAVED", "budgets", key, {}, db);
      return { id: key };
    });
  });
}
export async function saveAgentBudget(runId: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    z.string().max(64).parse(runId);
    return atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const [run] = await rows<{ result: string }>(
        "SELECT result FROM agent_runs WHERE id=? AND user_id=? AND status='COMPLETED'",
        [runId, u.id],
        db,
      );
      requireCondition(run, "NOT_FOUND");
      const raw = parseJson<{ outputs?: { generateBudgetSuggestion?: unknown } }>(run.result, {}).outputs?.generateBudgetSuggestion;
      const proposal = z
        .object({
          currency: z.string().length(3),
          categories: z
            .array(
              z.object({
                category: budgetSchema.shape.category,
                amount: budgetSchema.shape.amount,
              }),
            )
            .min(1)
            .max(12),
        })
        .parse(raw);
      await validCurrency(proposal.currency, db);
      const month = new Date().toISOString().slice(0, 7);
      for (const row of proposal.categories) {
        const [existing] = await rows("SELECT id FROM budgets WHERE user_id=? AND category=? AND month=?", [u.id, row.category, month], db);
        if (!existing) await checkUsageLimit(u.id, "BUDGETS", db, month);
        await write(
          "INSERT INTO budgets(id,user_id,category,amount,currency,month) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount)",
          [
            crypto.randomUUID(),
            u.id,
            row.category,
            row.amount,
            proposal.currency,
            month,
          ],
          db,
        );
      }
      await audit(
        u.id,
        "AGENT_BUDGET_SAVED",
        "agent_runs",
        runId,
        { month },
        db,
      );
      return { saved: true };
    });
  });
}
