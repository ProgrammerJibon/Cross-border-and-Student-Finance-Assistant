"use server";
import { gatewayOptions } from "@/services/gateway-config.service";
import { requirePlanPurchase } from "@/lib/entitlements";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { rows, write, atomic } from "@/lib/db";
import { planQuote, fulfillCheckout } from "@/services/billing.service";
import {
  createProviderCheckout,
  type Checkout,
} from "@/services/checkout-provider.service";

const selection = z.object({
  plan: z.string().min(1).max(64),
  cycle: z.enum(["monthly", "yearly"]),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
  extraSeats: z.number().int().min(0).max(100).default(0),
});
export async function checkoutOptions(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const v = selection.parse(input);
    await requirePlanPurchase(u.id, v.plan);
    const [pending] = await rows<Checkout>("SELECT * FROM provider_checkouts WHERE user_id=? AND recurring=1 AND status='CREATED' AND plan_id=? AND cycle=? AND environment=? AND extra_seats=? LIMIT 1",[u.id,v.plan,v.cycle,v.environment,v.extraSeats]);
    return {
      ...(pending ? {amount:pending.amount,currency:pending.currency} : await planQuote(v.plan, v.cycle, undefined, v.extraSeats)),
      ...(await gatewayOptions(v.environment)),
    };
  });
}
export async function startProviderCheckout(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const v = selection
      .extend({
        id: z.uuid(),
        provider: z.enum(["UNIONPAY", "STRIPE", "PAYPAL"]),
        locale: z.enum(["en", "bn-BD", "zh-CN"]),
        amount: z.string().regex(/^\d+\.\d{2}$/),
        currency: z.literal("USD"),
      })
      .parse(input);
    requireCondition(
      (await gatewayOptions(v.environment)).providers[v.provider],
      "CHECKOUT_NOT_CONFIGURED",
    );
    const checkout = await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      await requirePlanPurchase(u.id, v.plan, db);
      const [old] = await rows<Checkout>(
        "SELECT * FROM provider_checkouts WHERE id=?",
        [v.id],
        db,
      );
      if (old) {
        requireCondition(
          old.user_id === u.id &&
            old.plan_id === v.plan &&
            old.provider === v.provider &&
            old.cycle === v.cycle && old.environment === v.environment && old.extra_seats === v.extraSeats,
          "NOT_FOUND",
        );
        requireCondition(old.amount===v.amount && old.currency===v.currency,"CHECKOUT_PRICE_CHANGED");
        requireCondition(old.status !== "COMPLETED", "CHECKOUT_ALREADY_PAID");
        return old;
      }
      const [pending] = await rows<Checkout>(
        "SELECT * FROM provider_checkouts WHERE user_id=? AND recurring=1 AND status='CREATED' LIMIT 1",
        [u.id], db,
      );
      if(pending) {
        if (
          pending.amount === v.amount &&
          pending.currency === v.currency &&
          pending.plan_id === v.plan &&
          pending.provider === v.provider &&
          pending.environment === v.environment &&
          pending.extra_seats === v.extraSeats &&
          pending.cycle === v.cycle
        ) {
          return pending;
        }
        await write(
          "UPDATE provider_checkouts SET status='CANCELLED' WHERE id=? AND status='CREATED'",
          [pending.id],
          db,
        );
      }
      const [count] = await rows<{ n: number }>(
        "SELECT COUNT(*) n FROM provider_checkouts WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)",
        [u.id],
        db,
      );
      requireCondition(count.n < 10, "RATE_LIMITED");
      const quote = await planQuote(v.plan, v.cycle, db, v.extraSeats);
      requireCondition(
        quote.amount === v.amount && quote.currency === v.currency,
        "CHECKOUT_PRICE_CHANGED",
      );
      await write(
        "INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,environment,extra_seats,recurring) VALUES (?,?,?,?,?,?,?,?,?,1)",
        [v.id, u.id, v.plan, v.cycle, v.provider, quote.amount, quote.currency, v.environment, v.extraSeats],
        db,
      );
      return {
        id: v.id,
        user_id: u.id,
        plan_id: v.plan,
        cycle: v.cycle,
        provider: v.provider,
        ...quote,
        remote_id: null,
        approval_url: null,
        status: "CREATED",
        environment: v.environment, extra_seats: v.extraSeats, recurring: 1,
      } satisfies Checkout;
    });
    if (checkout.approval_url)
      return { id: checkout.id, url: checkout.approval_url };
    const remote = await createProviderCheckout(checkout, v.locale);
    await write(
      "UPDATE provider_checkouts SET remote_id=?,approval_url=? WHERE id=? AND user_id=?",
      [remote.id, remote.url, checkout.id, u.id],
    );
    return { id: checkout.id, url: remote.url };
  });
}
export async function completeProviderCheckout(id: string) {
  return action(async () => {
    const u = await requireUser();
    return fulfillCheckout(z.uuid().parse(id), u.id);
  });
}
export async function providerPaymentHistory() {
  return action(async () => {
    const u = await requireUser();
    return rows(
      "SELECT id,provider,purpose,environment,plan_id,cycle,amount,currency,status,remote_id reference,created_at FROM provider_checkouts WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      [u.id],
    );
  });
}
