import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const { rows, write, pool } = await import("../src/lib/db");
const { fulfillCheckout } = await import("../src/services/billing.service");

test("verified provider payment activates once under concurrent callbacks and rejects another owner", async (t) => {
  const user = `billing-test-${randomUUID()}`;
  const id = randomUUID();
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  t.after(() => {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  });
  try {
    await write(
      "INSERT INTO users(is_demo,id,name,email,password_hash,role) VALUES (1,?,? ,?,'fixture-no-login','STUDENT')",
      [user, "Billing test", `${user}@example.test`],
    );
    await write(
      "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student-free',UTC_TIMESTAMP(),'2099-12-31')",
      [randomUUID(), user],
    );
    await write(
      "INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,remote_id) VALUES (?,?,'student','monthly','UNIONPAY','2.48','USD',?)",
      [id, user, `cs_test_${id}`],
    );
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        id: `cs_test_${id}`,
        livemode: false,
        status: "complete",
        payment_status: "paid",
        amount_total: 248,
        currency: "usd",
        client_reference_id: id,
        metadata: { checkout_id: id },
        payment_intent: `pi_${id}`,
      }),
    );
    await assert.rejects(fulfillCheckout(id, "other-user"), {
      message: "NOT_FOUND",
    });
    const result = await Promise.all([
      fulfillCheckout(id, user),
      fulfillCheckout(id, user),
    ]);
    assert.ok(result.every((r) => r.status === "COMPLETED"));
    const [sub] = await rows<{ plan_id: string; days: number }>(
      "SELECT plan_id,DATEDIFF(ends_at,UTC_TIMESTAMP()) days FROM subscriptions WHERE user_id=?",
      [user],
    );
    assert.equal(sub.plan_id, "student");
    assert.ok(sub.days >= 28 && sub.days <= 31);
    const [events] = await rows<{ n: number }>(
      "SELECT COUNT(*) n FROM subscription_events WHERE user_id=? AND action='PROVIDER_PAYMENT'",
      [user],
    );
    assert.equal(events.n, 1);
    await fulfillCheckout(id, user);
    const [after] = await rows<{ n: number }>(
      "SELECT COUNT(*) n FROM subscription_events WHERE user_id=?",
      [user],
    );
    assert.equal(after.n, 1);
    const bad = randomUUID();
    await write(
      "INSERT INTO provider_checkouts(id,user_id,plan_id,cycle,provider,amount,currency,remote_id) VALUES (?,?,'pro','monthly','UNIONPAY','9.99','USD',?)",
      [bad, user, `cs_test_${bad}`],
    );
    await assert.rejects(fulfillCheckout(bad, user), {
      message: "CHECKOUT_MISMATCH",
    });
    const [unchanged] = await rows<{ plan_id: string }>(
      "SELECT plan_id FROM subscriptions WHERE user_id=?",
      [user],
    );
    assert.equal(unchanged.plan_id, "student");
  } finally {
    await write("DELETE FROM audit_logs WHERE actor_id=?", [user]);
    await write("DELETE FROM subscription_events WHERE user_id=?", [user]);
    await write("DELETE FROM provider_checkouts WHERE user_id=?", [user]);
    await write("DELETE FROM subscriptions WHERE user_id=?", [user]);
    await write("DELETE FROM users WHERE id=?", [user]);
    await pool.end();
  }
});
