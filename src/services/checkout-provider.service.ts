import "server-only";
import "@/lib/env";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, requireCondition } from "@/lib/errors";
import { gatewayConfig, type Environment } from "./gateway-config.service";
import { D } from "@/lib/money";

export type Provider = "PAYPAL" | "UNIONPAY" | "STRIPE" | "ALIPAY" | "WECHAT";
export type Checkout = {
  id: string;
  user_id: string;
  plan_id: string;
  cycle: string;
  provider: Provider;
  amount: string;
  currency: string;
  remote_id: string | null;
  approval_url: string | null;
  status: string;
  environment?: Environment;
  purpose?: string;
  request_id?: string | null;
  recurring?: number;
  extra_seats?: number;
  subscription_id?: string | null;
  renewal_status?: string | null;
};
const paypalHost = (env: Environment) => env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const stripeHost = "https://api.stripe.com/v1";
export function providerAvailability() {
  return {
    PAYPAL: !!(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
    ),
    UNIONPAY: /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || ""),
  };
}
async function request(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`Checkout API error ${response.status} from ${url}:`, err);
      throw new AppError("CHECKOUT_PROVIDER_ERROR");
    }
    return response.status === 204 ? {} : await response.json();
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error(`Checkout request network error to ${url}:`, e);
    // Never return provider payloads, credentials, or payment details to logs/UI.
    throw new AppError("CHECKOUT_PROVIDER_ERROR");
  }
}
async function paypalToken(environment: Environment) {
  const config = await gatewayConfig(environment);
  requireCondition(config.paypalClientId && config.paypalSecret, "CHECKOUT_NOT_CONFIGURED");
  const data = await request(`${paypalHost(environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return z.object({ access_token: z.string().min(1) }).parse(data).access_token;
}
export async function paypal(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
  environment: Environment = "sandbox",
) {
  return request(`${paypalHost(environment)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await paypalToken(environment)}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(key ? { "PayPal-Request-Id": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export async function stripe(path: string, body?: URLSearchParams, key?: string, environment: Environment = "sandbox", method?: string) {
  const config = await gatewayConfig(environment);
  requireCondition((environment === "live" ? /^sk_live_/ : /^sk_test_/).test(config.stripeSecret || ""), "CHECKOUT_NOT_CONFIGURED");
  return request(`${stripeHost}${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${config.stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: body.toString() } : {}),
  });
}
export function checkoutOrigin() {
  const base = process.env.CHECKOUT_BASE_URL || process.env.APP_URL || "http://127.0.0.1:3000";
  const url = new URL(base);
  requireCondition(
    url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)),
    "CHECKOUT_NOT_CONFIGURED",
  );
  return url.origin;
}
export async function createProviderCheckout(c: Checkout, locale: string) {
  const environment = c.environment || "sandbox";
  const back = c.purpose === "TOPUP"
    ? `${checkoutOrigin()}/${locale}/payments?checkout=${c.id}`
    : `${checkoutOrigin()}/${locale}/subscription/checkout?plan=${encodeURIComponent(c.plan_id)}&cycle=${c.cycle}&checkout=${c.id}`;
  if (c.provider === "PAYPAL") {
    if (c.recurring) {
      const product = await paypal("/v1/catalogs/products", "POST", {name: "FinBridge membership", type: "SERVICE", category: "SOFTWARE"}, `${c.id}-p`, environment);
      const plan = await paypal("/v1/billing/plans", "POST", {
        product_id: product.id, name: `FinBridge ${c.plan_id}`, status: "ACTIVE",
        billing_cycles: [{frequency: {interval_unit: c.cycle === "yearly" ? "YEAR" : "MONTH", interval_count: 1}, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: {fixed_price: {currency_code: c.currency,value: c.amount}}}],
        payment_preferences: {auto_bill_outstanding: true, payment_failure_threshold: 3},
      }, `${c.id}-l`, environment);
      const sub = await paypal("/v1/billing/subscriptions", "POST", {plan_id:plan.id,custom_id:c.id,application_context:{shipping_preference:"NO_SHIPPING",user_action:"SUBSCRIBE_NOW",return_url:back,cancel_url:`${back}&cancelled=1`}}, c.id, environment);
      const url = z.string().url().parse(sub.links?.find((l: {rel: string}) => l.rel === "approve")?.href);
      requireCondition(new URL(url).origin === (environment === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com"), "CHECKOUT_PROVIDER_ERROR");
      return {id: z.string().parse(sub.id), url};
    }
    const data = z
      .object({
        id: z.string(),
        links: z.array(z.object({ rel: z.string(), href: z.string() })),
      })
      .parse(
        await paypal(
          "/v2/checkout/orders",
          "POST",
          {
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: c.id,
                custom_id: c.id,
                amount: { currency_code: c.currency, value: c.amount },
              },
            ],
            payment_source: {
              paypal: {
                experience_context: {
                  shipping_preference: "NO_SHIPPING",
                  user_action: "PAY_NOW",
                  return_url: back,
                  cancel_url: `${back}&cancelled=1`,
                },
              },
            },
          },
          c.id,
          environment,
        ),
      );
    const url = data.links.find(
      (l) => l.rel === "payer-action" || l.rel === "approve",
    )?.href;
    requireCondition(
      url && new URL(url).origin === (environment === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com"),
      "CHECKOUT_PROVIDER_ERROR",
    );
    return { id: data.id, url };
  }
  const body = new URLSearchParams({
    mode: c.recurring ? "subscription" : "payment",
    "payment_method_types[0]": c.provider === "ALIPAY" ? "alipay" : c.provider === "WECHAT" ? "wechat_pay" : "card",
    client_reference_id: c.id,
    "metadata[checkout_id]": c.id,
    "line_items[0][price_data][currency]": c.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": D(c.amount).mul(100).toFixed(0),
    "line_items[0][price_data][product_data][name]": `FinBridge ${c.plan_id} · ${c.cycle} (${environment})`,
    "line_items[0][quantity]": "1",
    success_url: back,
    cancel_url: `${back}&cancelled=1`,
  });
  if(c.provider === "STRIPE") body.delete("payment_method_types[0]");
  requireCondition(!c.recurring || !["ALIPAY","WECHAT"].includes(c.provider), "RECURRING_UNSUPPORTED");
  if(c.provider === "WECHAT") body.set("payment_method_options[wechat_pay][client]", "web");
  if(c.recurring) {
    body.set("line_items[0][price_data][recurring][interval]", c.cycle === "yearly" ? "year" : "month");
    body.set("subscription_data[metadata][checkout_id]", c.id);
  }
  const data = z
    .object({ id: z.string(), url: z.string(), livemode: z.boolean() })
    .parse(await stripe("/checkout/sessions", body, c.id, environment));
  requireCondition(data.livemode === (environment === "live"), "CHECKOUT_MISMATCH");
  requireCondition(
    new URL(data.url).origin === "https://checkout.stripe.com",
    "CHECKOUT_PROVIDER_ERROR",
  );
  return { id: data.id, url: data.url };
}

const amountSchema = z.object({ currency_code: z.string(), value: z.string() });
const paypalOrder = z.object({
  id: z.string(),
  status: z.string(),
  purchase_units: z.array(
    z.object({
      custom_id: z.string(),
      amount: amountSchema,
      payments: z
        .object({
          captures: z.array(
            z.object({
              id: z.string(),
              status: z.string(),
              amount: amountSchema,
              final_capture: z.boolean().optional(),
            }),
          ),
        })
        .optional(),
    }),
  ),
});
export function verifyPayPalReceipt(raw: unknown, c: Checkout) {
  const order = paypalOrder.parse(raw);
  requireCondition(
    order.id === c.remote_id && order.purchase_units.length === 1,
    "CHECKOUT_MISMATCH",
  );
  const unit = order.purchase_units[0];
  requireCondition(
    unit.custom_id === c.id &&
      unit.amount.currency_code === c.currency &&
      D(unit.amount.value).eq(c.amount),
    "CHECKOUT_MISMATCH",
  );
  requireCondition(order.status === "COMPLETED", "CHECKOUT_PENDING");
  const captures = unit.payments?.captures || [];
  requireCondition(
    captures.length === 1 && captures[0].status === "COMPLETED",
    "CHECKOUT_PENDING",
  );
  const capture = captures[0];
  requireCondition(
    capture.amount.currency_code === c.currency &&
      D(capture.amount.value).eq(c.amount),
    "CHECKOUT_MISMATCH",
  );
  return capture.id;
}
export function verifyStripeReceipt(raw: unknown, c: Checkout) {
  const session = z
    .object({
      id: z.string(),
      livemode: z.boolean(),
      status: z.string(),
      payment_status: z.string(),
      amount_total: z.number(),
      currency: z.string(),
      client_reference_id: z.string(),
      metadata: z.object({ checkout_id: z.string() }),
      payment_intent: z.string().nullable(),
    })
    .parse(raw);
  requireCondition(
    session.livemode === (c.environment === "live") &&
      session.id === c.remote_id &&
      session.client_reference_id === c.id &&
      session.metadata.checkout_id === c.id &&
      session.currency.toUpperCase() === c.currency &&
      D(session.amount_total).eq(D(c.amount).mul(100)),
    "CHECKOUT_MISMATCH",
  );
  requireCondition(
    session.status === "complete" &&
      session.payment_status === "paid" &&
      session.payment_intent,
    "CHECKOUT_PENDING",
  );
  return session.payment_intent;
}
export async function verifyProviderCheckout(c: Checkout) {
  requireCondition(c.remote_id, "CHECKOUT_PENDING");
  const id = encodeURIComponent(c.remote_id);
  if (c.provider !== "PAYPAL")
    return verifyStripeReceipt(await stripe(`/checkout/sessions/${id}`, undefined, undefined, c.environment), c);
  let raw = await paypal(`/v2/checkout/orders/${id}`, "GET", undefined, undefined, c.environment);
  const order = paypalOrder.parse(raw);
  requireCondition(
    order.id === c.remote_id &&
      order.purchase_units.length === 1 &&
      order.purchase_units[0].custom_id === c.id &&
      order.purchase_units[0].amount.currency_code === c.currency &&
      D(order.purchase_units[0].amount.value).eq(c.amount),
    "CHECKOUT_MISMATCH",
  );
  if (order.status === "APPROVED") {
    await paypal(
      `/v2/checkout/orders/${id}/capture`,
      "POST",
      {},
      `cap-${c.id.replaceAll("-", "")}`,
      c.environment,
    );
    // Capture responses may omit purchase-unit metadata. Re-read the canonical
    // order before validating the stored reference, amount and capture status.
    raw = await paypal(`/v2/checkout/orders/${id}`, "GET", undefined, undefined, c.environment);
  }
  return verifyPayPalReceipt(raw, c);
}
export function verifyStripeSignature(
  body: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = header.split(",").map((x) => x.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1] || "";
  requireCondition(
    /^\d+$/.test(timestamp) && Math.abs(now / 1000 - Number(timestamp)) <= 300,
    "FORBIDDEN",
  );
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest();
  requireCondition(
    parts.some(
      ([key, value]) =>
        key === "v1" &&
        /^[a-f0-9]{64}$/.test(value || "") &&
        timingSafeEqual(expected, Buffer.from(value, "hex")),
    ),
    "FORBIDDEN",
  );
}
export async function verifyPayPalWebhook(headers: Headers, event: unknown, environment: Environment = "sandbox") {
  const config = await gatewayConfig(environment);
  requireCondition(config.paypalWebhookId, "CHECKOUT_NOT_CONFIGURED");
  const result = await paypal(
    "/v1/notifications/verify-webhook-signature",
    "POST",
    {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: config.paypalWebhookId,
      webhook_event: event,
    },
    undefined, environment,
  );
  requireCondition(result.verification_status === "SUCCESS", "FORBIDDEN");
}
