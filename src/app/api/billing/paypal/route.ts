import { processWebhook, recordProviderException, failProviderTopup } from "@/services/webhook-events.service";
import { verifyPayPalWebhook, type Checkout } from "@/services/checkout-provider.service";
import { fulfillCheckout } from "@/services/billing.service";
import { rows, write } from "@/lib/db";
export async function POST(request: Request) {
  const environment = new URL(request.url).searchParams.get("environment") === "live" ? "live" : "sandbox";
  const body = await request.text();
  if(body.length > 262144) return new Response("Too large",{status:413});
  let event;
  try { event=JSON.parse(body); await verifyPayPalWebhook(request.headers,event,environment); }
  catch { return new Response("Invalid signature",{status:400}); }
  try {
    await processWebhook("PAYPAL", environment, event.id, event.event_type, body, async () => {
      if (/refund|dispute|reversed|denied|failed/i.test(event.event_type)) await recordProviderException("PAYPAL", environment, event.id, event.event_type);
    const resource=event.resource || {};
    const remote=event.event_type === "PAYMENT.SALE.COMPLETED" ? resource.billing_agreement_id : resource.supplementary_data?.related_ids?.order_id || resource.id;
    if(typeof remote === "string") {
      if(event.event_type === "PAYMENT.CAPTURE.DENIED") await failProviderTopup("PAYPAL",environment,remote,"FAILED");
      const [c]=await rows<Checkout>("SELECT * FROM provider_checkouts WHERE provider='PAYPAL' AND environment=? AND remote_id=?",[environment,remote]);
      if(c) {
        if(["BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.EXPIRED"].includes(event.event_type)) await write("UPDATE provider_checkouts SET renewal_status='CANCELLED' WHERE id=?",[c.id]);
        else if(["CHECKOUT.ORDER.APPROVED","PAYMENT.CAPTURE.COMPLETED","PAYMENT.SALE.COMPLETED"].includes(event.event_type)) await fulfillCheckout(c.id);
      }
    }
    });
    return Response.json({received:true});
  } catch { return new Response("Not processed",{status:500}); }
}
