# Student plans and provider sandbox checkout

Student Free costs BDT 0 and has no expiry. Its monthly limits are 30 AI messages,
2 accounts, 3 transfer simulations, 1 tuition plan, 1 CSV import and 1 parent link.
Student Premium keeps the existing `student` plan ID, configurable price
(currently BDT 299/month or BDT 2990/year), and existing higher limits. Pro and
Family remain available. Existing subscriptions are not migrated to a different
plan. New student signups receive Free. Selecting a student demo explicitly
restores that demo account's chosen Free/Premium tier without clearing usage.

## Configure provider sandbox credentials

Add these to `.env.local` for development (and the deployment environment when
testing a hosted build). Do not commit secret values:

```dotenv
CHECKOUT_BASE_URL=http://127.0.0.1:3000
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Use PayPal **sandbox** business app credentials, and a Stripe **test** secret key
beginning `sk_test_`. Restart Next.js after configuring environment variables.
The implementation hardcodes PayPal's sandbox API and rejects Stripe live keys.
Run `npm run billing:check` to verify authentication with both providers without
creating a payment. It reports configuration/authentication status only, never
credentials or provider response bodies.
`CHECKOUT_BASE_URL` must match the browser origin so the login session survives
the provider redirect. Use your public HTTPS URL when testing remotely.

Run `npm run db:migrate` to create `provider_checkouts`, add Student Free,
rename Student to Student Premium without changing its prices, and provision
the Free demo when `DEMO_MODE=true`. Setup also runs this migration. The migration
does not delete data or overwrite configured paid-plan limits/prices.

## Checkout behavior

PayPal is listed and selected first. UnionPay uses Stripe's hosted card checkout;
it also accepts eligible Visa/Mastercard test cards. It is not a direct UnionPay
acquirer integration. Availability depends on the Stripe merchant region.

Open a student demo, then Subscription → Student Premium → Upgrade. Review the
USD quote and continue to the provider. PayPal does not accept BDT, so the server
converts the configured plan price to USD using the application's exchange rates.
The quoted amount is checked again on order creation and then stored unchanged.
These are one-time purchases for a month/year, not automatically renewing charges.

After returning, click **Verify payment**. The server retrieves the remote order,
captures an approved PayPal order where needed, validates reference, amount,
currency and completed status, and atomically activates the plan once. Repeated
callbacks cannot extend the subscription twice. Payment history also provides a
Verify link if the return page was closed. No card details pass through this app.
The existing wallet/remittance sandbox and its manual settlement flows are
separate from this subscription checkout.

## Webhooks and recovery

For automatic fulfillment even when the buyer closes the return page:

- PayPal: register `https://YOUR_HOST/api/billing/paypal` for
  `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`; configure its webhook
  ID. Signatures are verified through PayPal's verification API.
- Stripe: register `https://YOUR_HOST/api/billing/stripe` for
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
  Configure the signing secret. Raw-body HMAC validation includes a five-minute
  timestamp tolerance, and fulfillment independently fetches the session.
- For local Stripe tests, forward events with the Stripe CLI to
  `localhost:3000/api/billing/stripe` and use that listener's signing secret.

## Test with provider accounts

PayPal needs a sandbox **personal buyer account** different from the sandbox
business merchant. For Stripe, use the documented UnionPay test card
`6200 0000 0000 0005`, a future expiry and any three-digit CVC. Test success,
cancel, decline, repeated Verify, and webhook/return races. Never use real cards
in sandbox checkout.

Automated tests use isolated provider response fixtures to exercise verification;
these are test-only mocks. Production code never substitutes a fake provider
approval when credentials are absent.

References: [PayPal integration](https://developer.paypal.com/studio/checkout/standard/integrate),
[PayPal sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts),
[Stripe Checkout API](https://docs.stripe.com/api/checkout/sessions/create),
[Stripe test cards](https://docs.stripe.com/testing),
[UnionPay merchant availability](https://support.stripe.com/questions/list-of-stripe-account-countries-supported-by-unionpay).
