import { processWebhook, recordProviderException } from "@/services/webhook-events.service";
import { verifyStripeSignature, type Checkout } from "@/services/checkout-provider.service";
import { gatewayConfig } from "@/services/gateway-config.service";
import { fulfillCheckout } from "@/services/billing.service";
import { rows, write } from "@/lib/db";
export async function POST(request: Request) {
  const environment=new URL(request.url).searchParams.get("environment") === "live" ? "live" : "sandbox";
  const body=await request.text();
  if(body.length>262144) return new Response("Too large",{status:413});
  let event;
  try {
    const config=await gatewayConfig(environment);
    if(!config.stripeWebhookSecret) return new Response("Not configured",{status:503});
    verifyStripeSignature(body,request.headers.get("stripe-signature") || "",config.stripeWebhookSecret);
    event=JSON.parse(body);
    if(event.livemode !== (environment === "live")) return new Response("Wrong environment",{status:400});
  } catch { return new Response("Invalid signature",{status:400}); }
  try {
    await processWebhook("STRIPE", environment, event.id, event.type, body, async () => {
      if (/refund|dispute|reversed|denied|failed/i.test(event.type)) await recordProviderException("STRIPE", environment, event.id, event.type);
    const object=event.data?.object;
    let c: Checkout | undefined;
    if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)) {
      [c]=await rows<Checkout>("SELECT * FROM provider_checkouts WHERE provider IN ('UNIONPAY','STRIPE','ALIPAY','WECHAT') AND environment=? AND remote_id=?",[environment,object.id]);
    } else if(event.type === "invoice.paid") {
      const subscription=object.subscription || object.parent?.subscription_details?.subscription;
      const checkout=object.parent?.subscription_details?.metadata?.checkout_id || object.subscription_details?.metadata?.checkout_id;
      if(subscription) [c]=await rows<Checkout>("SELECT * FROM provider_checkouts WHERE provider IN ('UNIONPAY','STRIPE','ALIPAY','WECHAT') AND environment=? AND (subscription_id=? OR id=?)",[environment,subscription,checkout || ""]);
    } else if(["customer.subscription.deleted","customer.subscription.updated"].includes(event.type) && (object.status === "canceled" || object.cancel_at_period_end)) {
      await write("UPDATE provider_checkouts SET renewal_status='CANCELLED' WHERE provider IN ('UNIONPAY','STRIPE','ALIPAY','WECHAT') AND environment=? AND subscription_id=?",[environment,object.id]);
    }
    if(c) await fulfillCheckout(c.id);
    });
    return Response.json({received:true});
  } catch { return new Response("Not processed",{status:500}); }
}
