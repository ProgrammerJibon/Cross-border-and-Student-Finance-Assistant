"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
export async function purchasePlan(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        plan: z.string().max(64),
        cardholder: z.string().max(100).default("Demo card"),
        card: z.enum(["4242424242424242", "4000000000000002", ""]).optional(),
        expiry: z.string().default(""),
        cvv: z.string().default(""),
        savedCardId: z.string().max(64).optional(),
        saveCard: z.boolean().default(false),
        cycle: z.enum(["monthly", "yearly"]).default("monthly"),
      })
      .parse(input);
    return atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const [saved] = v.savedCardId
        ? await rows<{ demo_token: string; expiry: string; last_four: string }>(
            "SELECT demo_token,expiry,last_four FROM saved_cards WHERE id=? AND user_id=?",
            [v.savedCardId, u.id],
            db,
          )
        : [];
      requireCondition(!v.savedCardId || saved, "NOT_FOUND");
      const expiry = saved?.expiry || v.expiry;
      requireCondition(
        /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry),
        "VALIDATION_ERROR",
      );
      const [month, year] = expiry.split("/").map(Number);
      requireCondition(
        Date.UTC(2000 + year, month, 1) > Date.now(),
        "VALIDATION_ERROR",
      );
      if (!saved)
        requireCondition(
          v.card && /^\d{3}$/.test(v.cvv) && v.cardholder.length >= 2,
          "VALIDATION_ERROR",
        );
      const [p] = await rows<{
        monthly: string;
        yearly: string;
        currency: string;
      }>(
        "SELECT pr.monthly,pr.yearly,pr.currency FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id WHERE p.id=? AND p.active=1 AND p.trial_days=0",
        [v.plan],
        db,
      );
      requireCondition(p, "NOT_FOUND");
      const reference = "PAY-" + randomUUID().slice(0, 8).toUpperCase();
      const status = (
        saved
          ? saved.demo_token === "DEMO_SUCCESS"
          : v.card === "4242424242424242"
      )
        ? "SUCCESS"
        : "FAILED";
      await write(
        "INSERT INTO demo_payments(id,user_id,plan_id,amount,currency,last_four,status,reference) VALUES (?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          u.id,
          v.plan,
          p[v.cycle],
          p.currency,
          saved?.last_four || v.card!.slice(-4),
          status,
          reference,
        ],
        db,
      );
      if (v.saveCard && !saved && status === "SUCCESS") {
        const exists = await rows(
          "SELECT id FROM saved_cards WHERE user_id=? AND last_four='4242' AND expiry=?",
          [u.id, expiry],
          db,
        );
        if (!exists.length)
          await write(
            "INSERT INTO saved_cards(id,user_id,label,last_four,expiry,demo_token) VALUES (?,?,?,'4242',?,'DEMO_SUCCESS')",
            [randomUUID(), u.id, v.cardholder, expiry],
            db,
          );
      }
      if (status === "SUCCESS") {
        await write(
          "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MONTH)) ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status='ACTIVE',starts_at=VALUES(starts_at),ends_at=VALUES(ends_at)",
          [randomUUID(), u.id, v.plan, v.cycle === "yearly" ? 12 : 1],
          db,
        );
        await write(
          "INSERT INTO subscription_events(id,user_id,plan_id,action,cycle) VALUES (?,?,?,'PURCHASED',?)",
          [randomUUID(), u.id, v.plan, v.cycle],
          db,
        );
      }
      await audit(
        u.id,
        "DEMO_PAYMENT",
        "subscriptions",
        u.id,
        { reference, status, plan: v.plan, amount: p[v.cycle], cycle: v.cycle },
        db,
      );
      return { reference, status };
    });
  });
}
export async function cancelSubscription() {
  return action(async () => {
    const u = await requireUser();
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
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
