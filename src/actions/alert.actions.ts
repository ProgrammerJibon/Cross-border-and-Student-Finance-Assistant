"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
export async function updateAlert(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        id: z.string().max(64),
        status: z.enum(["READ", "DISMISSED", "SNOOZED"]),
      })
      .parse(input);
    const r = await write(
      "UPDATE alerts SET status=?,snoozed_until=IF(?='SNOOZED',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),NULL) WHERE id=? AND user_id=?",
      [v.status, v.status, v.id, u.id],
    );
    requireCondition(r.affectedRows, "NOT_FOUND");
    return null;
  });
}
export async function readNotifications() {
  return action(async () => {
    const u = await requireUser();
    await write("UPDATE notifications SET is_read=1 WHERE user_id=?", [u.id]);
    return null;
  });
}
export async function createReminder(detail: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    z.string().min(1).max(500).parse(detail);
    await write(
      "INSERT INTO alerts(id,user_id,type,severity,detail) VALUES (?,?,'REMINDER','INFO',?)",
      [randomUUID(), u.id, detail],
    );
    return null;
  });
}
