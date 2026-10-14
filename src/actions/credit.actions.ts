"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { write } from "@/lib/db";
import { action } from "@/lib/errors";
export async function updateCredit(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = z
      .object({
        utilization: z.number().int().min(0).max(100),
        age_months: z.number().int().min(0).max(1200),
        overdue: z.number().int().min(0).max(100),
        on_time: z.number().int().min(0).max(1200),
      })
      .parse(input);
    await write(
      "INSERT INTO credit_profiles(user_id,utilization,age_months,overdue,on_time) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE utilization=VALUES(utilization),age_months=VALUES(age_months),overdue=VALUES(overdue),on_time=VALUES(on_time)",
      [u.id, v.utilization, v.age_months, v.overdue, v.on_time],
    );
    return null;
  });
}
export async function toggleCreditTask(task: string, completed: boolean) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    z.enum([
      "creditReminders",
      "creditUtilization",
      "creditHistory",
      "creditReport",
    ]).parse(task);
    z.boolean().parse(completed);
    await write(
      "INSERT INTO credit_tasks(id,user_id,task_key,completed) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE completed=VALUES(completed)",
      [randomUUID(), u.id, task, completed],
    );
    return null;
  });
}
