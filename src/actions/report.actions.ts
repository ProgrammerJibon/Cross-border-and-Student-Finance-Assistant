"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { write } from "@/lib/db";
import { action } from "@/lib/errors";
import { audit } from "@/lib/audit";
export async function submitReport(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        category: z.enum([
          "AI",
          "TRANSACTION",
          "CALCULATION",
          "ACCOUNT",
          "APPLICATION",
        ]),
        subject: z.string().min(3).max(160),
        description: z.string().min(10).max(4000),
        related_id: z.string().max(64).default(""),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      })
      .parse(input);
    const key = randomUUID();
    await write(
      "INSERT INTO reports(id,user_id,category,subject,description,related_id,priority) VALUES (?,?,?,?,?,?,?)",
      [
        key,
        u.id,
        v.category,
        v.subject,
        v.description,
        v.related_id || null,
        v.priority,
      ],
    );
    await audit(u.id, "REPORT_CREATED", "reports", key);
    return { id: key };
  });
}
