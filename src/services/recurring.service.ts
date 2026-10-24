import "server-only";
import { paypal, stripe, type Checkout } from "./checkout-provider.service";
import { requireCondition } from "@/lib/errors";
import { D } from "@/lib/money";
import { rows, write } from "@/lib/db";

export async function recurringReceipt(c: Checkout) {
  requireCondition(c.remote_id, "CHECKOUT_PENDING");
  if (c.provider === "PAYPAL") {
    const sub = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(c.remote_id)}`, "GET", undefined, undefined, c.environment);
    requireCondition(sub.id === c.remote_id && sub.custom_id === c.id, "CHECKOUT_MISMATCH");
    requireCondition(["ACTIVE", "CANCELLED", "SUSPENDED"].includes(sub.status) && sub.billing_info?.last_payment, "CHECKOUT_PENDING");
    const plan = await paypal(`/v1/billing/plans/${encodeURIComponent(sub.plan_id)}`, "GET", undefined, undefined, c.environment);
    const price = plan.billing_cycles?.find((x: {tenure_type: string}) => x.tenure_type === "REGULAR")?.pricing_scheme?.fixed_price;
    requireCondition(price?.currency_code === c.currency && D(price.value).eq(c.amount), "CHECKOUT_MISMATCH");
    const last = sub.billing_info.last_payment;
    requireCondition(last.amount?.currency_code === c.currency && D(last.amount.value).eq(c.amount), "CHECKOUT_MISMATCH");
    const start = new Date(new Date(last.time).getTime() - 86400000).toISOString();
    const payments = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(c.remote_id)}/transactions?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(new Date().toISOString())}`, "GET", undefined, undefined, c.environment);
    const paid = payments.transactions?.find((p: {status: string;time: string;amount_with_breakdown?:{gross_amount?:{currency_code:string;value:string}}}) => p.status === "COMPLETED" && new Date(p.time).getTime() === new Date(last.time).getTime() && p.amount_with_breakdown?.gross_amount?.currency_code === c.currency && D(p.amount_with_breakdown.gross_amount.value).eq(c.amount));
    requireCondition(paid?.id, "CHECKOUT_PENDING");
    const until = new Date(last.time);
    if(c.cycle === "yearly") until.setUTCFullYear(until.getUTCFullYear()+1); else until.setUTCMonth(until.getUTCMonth()+1);
    return { receipt: String(paid.id), subscription: String(sub.id), until: sub.billing_info.next_billing_time || until.toISOString(), status: sub.status };
  }
  const session = await stripe(`/checkout/sessions/${encodeURIComponent(c.remote_id)}?expand[]=subscription.latest_invoice`, undefined, undefined, c.environment);
  requireCondition(session.id === c.remote_id && session.client_reference_id === c.id && session.metadata?.checkout_id === c.id && session.livemode === (c.environment === "live") && session.currency?.toUpperCase() === c.currency && D(session.amount_total).eq(D(c.amount).mul(100)), "CHECKOUT_MISMATCH");
  requireCondition(session.status === "complete" && session.payment_status === "paid", "CHECKOUT_PENDING");
  const sub = session.subscription;
  requireCondition(sub?.metadata?.checkout_id === c.id && (!c.subscription_id || sub.id === c.subscription_id), "CHECKOUT_MISMATCH");
  const invoice = sub.latest_invoice;
  requireCondition(invoice?.status === "paid" && invoice.currency?.toUpperCase() === c.currency && D(invoice.amount_paid).eq(D(c.amount).mul(100)), "CHECKOUT_PENDING");
  const end = invoice.lines?.data?.[0]?.period?.end;
  requireCondition(Number.isFinite(end), "CHECKOUT_MISMATCH");
  return { receipt: String(invoice.id), subscription: String(sub.id), until: new Date(end*1000).toISOString(), status: sub.status === "active" && !sub.cancel_at_period_end ? "ACTIVE" : "CANCELLED" };
}

export async function cancelRecurring(c: Checkout) {
  if(!c.subscription_id || c.renewal_status === "CANCELLED") return;
  if(c.provider === "PAYPAL") {
    const path = `/v1/billing/subscriptions/${encodeURIComponent(c.subscription_id)}`;
    const sub = await paypal(path,"GET",undefined,undefined,c.environment);
    if(!["CANCELLED","EXPIRED"].includes(sub.status)) await paypal(`${path}/cancel`,"POST",{reason:"Membership cancelled or replaced by account owner"},undefined,c.environment);
  } else {
    await stripe(`/subscriptions/${encodeURIComponent(c.subscription_id)}`,new URLSearchParams({cancel_at_period_end:"true"}),undefined,c.environment);
  }
  await write("UPDATE provider_checkouts SET renewal_status='CANCELLED' WHERE id=?",[c.id]);
}
export async function cancelUserRenewals(userId: string, except?: string) {
  const subscriptions = await rows<Checkout>("SELECT * FROM provider_checkouts WHERE user_id=? AND recurring=1 AND subscription_id IS NOT NULL AND (renewal_status IS NULL OR renewal_status<>'CANCELLED') AND id<>?",[userId,except || ""]);
  for(const c of subscriptions) await cancelRecurring(c);
}
