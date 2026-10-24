import test, { after } from "node:test";
import { pool } from "../src/lib/db";
after(() => pool.end());
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createProviderCheckout,
  verifyProviderCheckout,
  verifyPayPalReceipt,
  verifyStripeReceipt,
  verifyStripeSignature,
  providerAvailability,
  type Checkout,
} from "../src/services/checkout-provider.service";

const checkout: Checkout = {
  environment: "sandbox",
  id: "9b810686-793d-476d-b9de-9b653807df4a",
  user_id: "student-a",
  plan_id: "student",
  cycle: "monthly",
  provider: "PAYPAL",
  amount: "2.48",
  currency: "USD",
  remote_id: "ORDER-1",
  approval_url: null,
  status: "CREATED",
};
const paypalReceipt = () => ({
  id: "ORDER-1",
  status: "COMPLETED",
  purchase_units: [
    {
      custom_id: checkout.id,
      amount: { value: "2.48", currency_code: "USD" },
      payments: {
        captures: [
          {
            id: "CAPTURE-1",
            status: "COMPLETED",
            amount: { value: "2.48", currency_code: "USD" },
          },
        ],
      },
    },
  ],
});
const stripeReceipt = () => ({
  id: "SESSION-1",
  livemode: false,
  status: "complete",
  payment_status: "paid",
  amount_total: 248,
  currency: "usd",
  client_reference_id: checkout.id,
  metadata: { checkout_id: checkout.id },
  payment_intent: "pi_test",
});

test("PayPal requires a completed capture, correct owner reference, amount and currency", () => {
  assert.equal(verifyPayPalReceipt(paypalReceipt(), checkout), "CAPTURE-1");
  for (const mutate of [
    (r: ReturnType<typeof paypalReceipt>) => {
      r.id = "OTHER";
    },
    (r: ReturnType<typeof paypalReceipt>) => {
      r.purchase_units[0].custom_id = "another-user-order";
    },
    (r: ReturnType<typeof paypalReceipt>) => {
      r.purchase_units[0].amount.value = "0.01";
    },
    (r: ReturnType<typeof paypalReceipt>) => {
      r.purchase_units[0].payments.captures[0].amount.currency_code = "EUR";
    },
    (r: ReturnType<typeof paypalReceipt>) => {
      r.purchase_units[0].payments.captures[0].status = "PENDING";
    },
    (r: ReturnType<typeof paypalReceipt>) => {
      r.status = "APPROVED";
    },
  ]) {
    const r = paypalReceipt();
    mutate(r);
    assert.throws(() => verifyPayPalReceipt(r, checkout));
  }
});
test("Stripe rejects live, unpaid, mispriced and unrelated Checkout Sessions", () => {
  const c = {
    ...checkout,
    provider: "UNIONPAY" as const,
    remote_id: "SESSION-1",
  };
  assert.equal(verifyStripeReceipt(stripeReceipt(), c), "pi_test");
  for (const patch of [
    { livemode: true },
    { payment_status: "unpaid" },
    { amount_total: 1 },
    { currency: "eur" },
    { client_reference_id: "other" },
    { metadata: { checkout_id: "other" } },
    { id: "OTHER" },
  ])
    assert.throws(() =>
      verifyStripeReceipt({ ...stripeReceipt(), ...patch }, c),
    );
});
test("Stripe webhook signature rejects tampering and replayed timestamps", () => {
  const body = '{"test":true}',
    secret = "whsec_fixture",
    timestamp = "1800000000";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  assert.doesNotThrow(() =>
    verifyStripeSignature(
      body,
      `t=${timestamp},v1=${signature}`,
      secret,
      1800000000000,
    ),
  );
  assert.throws(() =>
    verifyStripeSignature(
      body + " ",
      `t=${timestamp},v1=${signature}`,
      secret,
      1800000000000,
    ),
  );
  assert.throws(() =>
    verifyStripeSignature(
      body,
      `t=${timestamp},v1=${signature}`,
      secret,
      1800000600000,
    ),
  );
});
test("provider requests use real sandbox endpoints, server amounts and idempotency", async (t) => {
  process.env.PAYMENT_CONFIG_SOURCE = "environment";
  const previous = {
    paypal: process.env.PAYPAL_CLIENT_ID,
    secret: process.env.PAYPAL_CLIENT_SECRET,
    stripe: process.env.STRIPE_SECRET_KEY,
    origin: process.env.CHECKOUT_BASE_URL,
  };
  process.env.PAYPAL_CLIENT_ID = "fixture-client";
  process.env.PAYPAL_CLIENT_SECRET = "fixture-secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  process.env.CHECKOUT_BASE_URL = "http://127.0.0.1:3000";
  t.after(() => {
    for (const [key, value] of Object.entries({
      PAYPAL_CLIENT_ID: previous.paypal,
      PAYPAL_CLIENT_SECRET: previous.secret,
      STRIPE_SECRET_KEY: previous.stripe,
      CHECKOUT_BASE_URL: previous.origin,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const requests: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.endsWith("/v1/oauth2/token"))
      return Response.json({ access_token: "fixture-token" });
    if (url.endsWith("/v2/checkout/orders"))
      return Response.json({
        id: "ORDER-1",
        links: [
          {
            rel: "payer-action",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
          },
        ],
      });
    if (url.endsWith("/v2/checkout/orders/ORDER-1"))
      return Response.json({
        ...paypalReceipt(),
        status: requests.some((r) => r.url.endsWith("/capture"))
          ? "COMPLETED"
          : "APPROVED",
      });
    if (url.endsWith("/capture")) return Response.json(paypalReceipt());
    if (url.endsWith("/checkout/sessions"))
      return Response.json({
        id: "SESSION-1",
        url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
        livemode: false,
      });
    throw new Error("Unexpected request");
  });
  await createProviderCheckout(checkout, "en");
  const order = requests.find((r) => r.url.endsWith("/v2/checkout/orders"))!;
  assert.equal(new URL(order.url).origin, "https://api-m.sandbox.paypal.com");
  const body = JSON.parse(String(order.init.body));
  assert.equal(body.purchase_units[0].amount.value, "2.48");
  assert.equal(body.purchase_units[0].custom_id, checkout.id);
  assert.equal(
    new Headers(order.init.headers).get("PayPal-Request-Id"),
    checkout.id,
  );
  assert.equal(await verifyProviderCheckout(checkout), "CAPTURE-1");
  assert.equal(
    new Headers(
      requests.find((r) => r.url.endsWith("/capture"))!.init.headers,
    ).get("PayPal-Request-Id"),
    `cap-${checkout.id.replaceAll("-", "")}`,
  );
  await createProviderCheckout({ ...checkout, provider: "UNIONPAY" }, "en");
  const stripe = requests.at(-1)!;
  assert.equal(stripe.url, "https://api.stripe.com/v1/checkout/sessions");
  const params = new URLSearchParams(String(stripe.init.body));
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "248");
  assert.equal(params.get("payment_method_types[0]"), "card");
  await createProviderCheckout({ ...checkout, provider: "STRIPE" }, "en");
  assert.equal(new URLSearchParams(String(requests.at(-1)!.init.body)).has("payment_method_types[0]"), false, "Full Stripe Checkout uses dynamic methods");
  await createProviderCheckout({ ...checkout, provider: "STRIPE", recurring: 1 }, "en");
  const recurring = new URLSearchParams(String(requests.at(-1)!.init.body));
  assert.equal(recurring.get("mode"), "subscription");
  assert.equal(recurring.get("line_items[0][price_data][recurring][interval]"), "month");
  for (const provider of ["ALIPAY", "WECHAT"] as const) {
    await createProviderCheckout({ ...checkout, provider }, "en");
    const wallet = new URLSearchParams(String(requests.at(-1)!.init.body));
    assert.equal(wallet.get("payment_method_types[0]"), provider === "ALIPAY" ? "alipay" : "wechat_pay");
    if(provider === "WECHAT") assert.equal(wallet.get("payment_method_options[wechat_pay][client]"), "web");
    await assert.rejects(createProviderCheckout({ ...checkout, provider, recurring: 1 }, "en"), {message:"RECURRING_UNSUPPORTED"});
  }
  process.env.STRIPE_SECRET_KEY = "sk_live_disallowed";
  assert.equal(providerAvailability().UNIONPAY, false);
  await assert.rejects(
    createProviderCheckout({ ...checkout, provider: "UNIONPAY" }, "en"),
    { message: "CHECKOUT_NOT_CONFIGURED" },
  );
});
