import { gatewayConfig } from "../src/services/gateway-config.service";
import { stripe, paypal } from "../src/services/checkout-provider.service";
import { pool } from "../src/lib/db";
try {
  for (const environment of ["sandbox","live"] as const) {
    const config=await gatewayConfig(environment);
    console.log(environment, Object.fromEntries(["stripePublishableKey","stripeSecret","stripeWebhookSecret","paypalClientId","paypalSecret","paypalWebhookId"].map(k=>[k,!!config[k as keyof typeof config]])));
    for(const provider of ["STRIPE","PAYPAL"]) {
      if(provider==="STRIPE"?!config.stripeSecret:!config.paypalClientId||!config.paypalSecret) {console.log(environment,provider,"NOT CONFIGURED");continue;}
      try {
        if(provider==="STRIPE") await stripe("/account",undefined,undefined,environment);
        else if(config.paypalWebhookId) await paypal(`/v1/notifications/webhooks/${encodeURIComponent(config.paypalWebhookId)}`,"GET",undefined,undefined,environment);
        else {console.log(environment,provider,"WEBHOOK NOT CONFIGURED");continue;}
        console.log(environment,provider,"AUTHENTICATED; checkout has not been tested");
      } catch { console.log(environment,provider,"AUTHENTICATION / WEBHOOK LOOKUP FAILED"); }
    }
  }
} finally { await pool.end(); }
