import "server-only";
import { requireCheckoutEnvironment, requireDemoFinance } from "@/lib/financial-environment";
import { recurringReceipt, cancelUserRenewals } from "./recurring.service";
import { settleProviderTopup } from "./payment.service";
import { extraSeatPrice } from "@/lib/plan-policy";
import { requirePlanPurchase } from "@/lib/entitlements";
import { randomUUID } from "node:crypto";
import { rows, write, atomic, type DB } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { D, convert, money } from "@/lib/money";
import { getRates } from "./currency.service";
import {
  verifyProviderCheckout,
  type Checkout,
} from "./checkout-provider.service";

export async function planQuote(
  plan: string,
  cycle: "monthly" | "yearly",
  db?: DB,
  extraSeats = 0,
) {
  const [p] = await rows<{ monthly: string; yearly: string; currency: string }>(
    "SELECT pr.* FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id WHERE p.id=? AND p.active=1 AND p.trial_days=0",
    [plan],
    db,
  );
  requireCondition(p && D(p[cycle]).gt(0), "NOT_FOUND");
  // PayPal does not support BDT. Both gateways receive the same disclosed USD quote.
  const rates = await getRates(db);
  requireCondition(
    p.currency === "USD" ||
      (D(rates[p.currency] || 0).gt(0) && D(rates.USD || 0).gt(0)),
    "CHECKOUT_CURRENCY_UNAVAILABLE",
  );
  requireCondition(extraSeats === 0 || (plan === "family-pro" && cycle === "monthly"), "PLAN_NOT_ALLOWED");
  requireCondition(!extraSeats || D(rates.BDT || 0).gt(0), "CHECKOUT_CURRENCY_UNAVAILABLE");
  const extra = extraSeats ? convert(String(extraSeats * extraSeatPrice),rates.BDT,rates[p.currency]) : "0";
  const total = D(p[cycle]).plus(extra).toFixed(2);
  const amount =
    p.currency === "USD"
      ? money(total)
      : convert(total, rates[p.currency], rates.USD);
  requireCondition(D(amount).gte("0.50"), "CHECKOUT_CURRENCY_UNAVAILABLE");
  return { amount, currency: "USD" };
}
export async function fulfillCheckout(id: string, owner?: string) {
  const [checkout] = await rows<Checkout>(
    "SELECT * FROM provider_checkouts WHERE id=?",
    [id],
  );
  requireCondition(
    checkout && (!owner || checkout.user_id === owner),
    "NOT_FOUND",
  );
  await requireCheckoutEnvironment(checkout);
  if (checkout.purpose === "TOPUP") await requireDemoFinance(checkout.user_id);
  requireCondition(!["CANCELLED", "FAILED", "REVERSED", "REFUNDED", "DISPUTED"].includes(checkout.status), "INVALID_STATE");
  if (checkout.status === "COMPLETED" && !checkout.recurring)
    return { status: "COMPLETED", reference: checkout.remote_id! };
  const recurring = checkout.recurring ? await recurringReceipt(checkout) : null;
  const receipt = recurring?.receipt || await verifyProviderCheckout(checkout);
  if (recurring && checkout.status !== "COMPLETED") await cancelUserRenewals(checkout.user_id,checkout.id);
  await atomic(async (db) => {
    const [user] = await rows<{ status: string }>(
      "SELECT status FROM users WHERE id=? FOR UPDATE",
      [checkout.user_id],
      db,
    );
    requireCondition(user?.status === "ACTIVE", "FORBIDDEN");
    const [locked] = await rows<Checkout>(
      "SELECT * FROM provider_checkouts WHERE id=? FOR UPDATE",
      [id],
      db,
    );
    await requireCheckoutEnvironment(locked, db);
    requireCondition(locked.remote_id === checkout.remote_id && locked.amount === checkout.amount && locked.currency === checkout.currency && locked.environment === checkout.environment, "CHECKOUT_MISMATCH");
    requireCondition(!["CANCELLED", "FAILED", "REVERSED", "REFUNDED", "DISPUTED"].includes(locked.status), "INVALID_STATE");
    if (locked.status === "COMPLETED" && !recurring) return;
    if (recurring) {
      const [seen] = await rows("SELECT receipt FROM provider_renewals WHERE provider=? AND environment=? AND receipt=?",[checkout.provider,checkout.environment || "sandbox",receipt],db);
      if(seen) return;
      // A cancelled/replaced agreement cannot overwrite the newly selected plan.
      if(locked.status === "COMPLETED" && locked.renewal_status === "CANCELLED") return;
    }
    if (checkout.purpose === "TOPUP") {
      await write("INSERT INTO provider_topup_receipts(processor,environment,receipt,checkout_id) VALUES (?,?,?,?)",[checkout.provider === "PAYPAL" ? "PAYPAL" : "STRIPE",checkout.environment!,receipt,checkout.id],db);
      await settleProviderTopup(checkout, receipt, db);
      await write("UPDATE provider_checkouts SET status='COMPLETED',receipt=?,completed_at=UTC_TIMESTAMP() WHERE id=?",[receipt,id],db);
      return;
    }
    await requirePlanPurchase(checkout.user_id, checkout.plan_id, db, checkout.environment === "sandbox");
    requireCondition(
      locked.remote_id === checkout.remote_id,
      "CHECKOUT_MISMATCH",
    );
    if(recurring) {
      const until = new Date(recurring.until);
      requireCondition(Number.isFinite(until.getTime()), "CHECKOUT_MISMATCH");
      await write("INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at,extra_seats) VALUES (?,?,?,'ACTIVE',UTC_TIMESTAMP(),?,?) ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status='ACTIVE',ends_at=VALUES(ends_at),extra_seats=VALUES(extra_seats)", [randomUUID(),checkout.user_id,checkout.plan_id,until,checkout.extra_seats || 0],db);
      await write("INSERT INTO provider_renewals(provider,environment,receipt,checkout_id,paid_until) VALUES (?,?,?,?,?)",[checkout.provider,checkout.environment || "sandbox",receipt,id,until],db);
      await write("UPDATE provider_checkouts SET subscription_id=?,renewal_status=? WHERE id=?",[recurring.subscription,recurring.status,id],db);
    } else await write(
      "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'ACTIVE',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MONTH)) ON DUPLICATE KEY UPDATE ends_at=DATE_ADD(IF(plan_id=VALUES(plan_id) AND status='ACTIVE',GREATEST(ends_at,UTC_TIMESTAMP()),UTC_TIMESTAMP()),INTERVAL ? MONTH),plan_id=VALUES(plan_id),status='ACTIVE',starts_at=UTC_TIMESTAMP()",
      [
        randomUUID(),
        checkout.user_id,
        checkout.plan_id,
        checkout.cycle === "yearly" ? 12 : 1,
        checkout.cycle === "yearly" ? 12 : 1,
      ],
      db,
    );
    await write(
      "UPDATE provider_checkouts SET status='COMPLETED',receipt=?,completed_at=UTC_TIMESTAMP() WHERE id=?",
      [receipt, id],
      db,
    );
    await write(
      "INSERT INTO subscription_events(id,user_id,plan_id,action,cycle) VALUES (?,?,?,'PROVIDER_PAYMENT',?)",
      [randomUUID(), checkout.user_id, checkout.plan_id, checkout.cycle],
      db,
    );
    await audit(
      checkout.user_id,
      "PROVIDER_PAYMENT",
      "provider_checkouts",
      id,
      {
        provider: checkout.provider,
        reference: checkout.remote_id,
        amount: checkout.amount,
        currency: checkout.currency,
      },
      db,
    );
  });
  return { status: "COMPLETED", reference: checkout.remote_id! };
}
