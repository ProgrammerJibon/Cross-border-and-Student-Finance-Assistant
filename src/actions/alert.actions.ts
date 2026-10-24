"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { write, atomic } from "@/lib/db";
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
export async function markNotificationRead(id: string) {
  return action(async () => {
    const u = await requireUser();
    z.string().min(1).max(64).parse(id);
    await write("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", [
      id,
      u.id,
    ]);
    return null;
  });
}
export async function saveNotificationSubscription(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        endpoint: z.string().min(1).max(1000),
        expirationTime: z.number().nullable().optional(),
        p256dh: z.string().min(1).max(255),
        auth: z.string().min(1).max(255),
      })
      .parse(input);
    await write(
      "INSERT INTO notification_subscriptions (id, user_id, endpoint, expiration_time, p256dh, auth) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE endpoint=VALUES(endpoint), expiration_time=VALUES(expiration_time), p256dh=VALUES(p256dh), auth=VALUES(auth)",
      [
        randomUUID(),
        u.id,
        v.endpoint,
        v.expirationTime || null,
        v.p256dh,
        v.auth,
      ],
    );
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

export async function resubscribeDevice(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        deviceId: z.uuid(),
        scope: z.url().max(1000),
        subscription: z
          .object({
            endpoint: z.url().max(1000),
            expirationTime: z.number().nullable().optional(),
            keys: z.object({
              p256dh: z.string().min(1).max(255),
              auth: z.string().min(1).max(255),
            }),
          })
          .nullable(),
      })
      .parse(input);
    await atomic(async (db) => {
      await write(
        "UPDATE user_preferences SET notifications=1 WHERE user_id=?",
        [u.id],
        db,
      );
      await write(
        "INSERT INTO notification_devices(user_id,device_id,scope,permission) VALUES (?,?,?,'granted') ON DUPLICATE KEY UPDATE scope=VALUES(scope),permission='granted',updated_at=UTC_TIMESTAMP()",
        [u.id, v.deviceId, v.scope],
        db,
      );
      if (v.subscription)
        await write(
          "INSERT INTO notification_subscriptions(id,user_id,endpoint,expiration_time,p256dh,auth) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE expiration_time=VALUES(expiration_time),p256dh=VALUES(p256dh),auth=VALUES(auth),updated_at=UTC_TIMESTAMP()",
          [
            randomUUID(),
            u.id,
            v.subscription.endpoint,
            v.subscription.expirationTime ?? null,
            v.subscription.keys.p256dh,
            v.subscription.keys.auth,
          ],
          db,
        );
    });
    return { saved: true };
  });
}
