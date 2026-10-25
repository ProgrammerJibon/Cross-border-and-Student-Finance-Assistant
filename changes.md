# FinBridge AI — Required Changes

Upgrade the **existing codebase**, not a new application. Review affected files and implement, connect, and test each requirement end to end. Preserve all working features and strict Demo/Live financial isolation.

## Live Account Onboarding
- [x] Add a selectable **student status** (for student accounts) and selectable **home country** and **study country**; persist and allow edits later.
- [x] Upgrade tuition-plan onboarding: collect institution, programme, semester/term, tuition amount and currency, due dates, funding needs, and relevant payment schedule; validate, save, and integrate these details with the Tuition Planner.
- [x] In **Your Finance**, let users record income and expenses for budgeting and analytics **without crediting or debiting actual wallet balances**. Keep budget records separate from financial ledger transactions.
- [x] Remove **Sandbox** from the Live account sidebar. Do not remove Demo mode itself.
- [x] Remove the banner: `LIVE account — only verified funds are available. Money movement awaits approved financial partners.`
- [x] Make additional authentication/security setup (such as MFA) **optional and accessible to all user roles**, including admins; do not remove normal sign-in or authorization checks.

## Global UI and Form Fixes
- [x] Fix inadequate **vertical margins, spacing, alignment, and responsive layout** around buttons and form controls throughout the application.
- [x] Replace generic `Check the form fields and try again.` messages with **specific field-level and server-side validation errors** showing exactly what failed, without leaking sensitive information.
- [x] Show the **full language name** in the language selector (e.g., English, বাংলা, 简体中文), not two-letter abbreviations. Do not change the selector's background colour on focus; keep an accessible visible focus indicator.
- [x] Audit all pages and forms for the same spacing and validation problems, not only the reported examples.

## Payment Gateway — Critical, Must Actually Work
- [ ] Keep **Manual Add Money** and implement a separate, functional **Gateway Add Money** option; do not show a non-functional gateway UI or a manual-only flow.
- [x] In the Admin panel, add secure settings for **Stripe publishable key + secret key** and **PayPal client ID + client secret**, plus required webhook configuration and clear activation/test status. Store secrets server-side securely; never return them to browsers or logs.
- [ ] Build complete Stripe Checkout and PayPal Checkout flows: select destination wallet and amount, create a server-side payment order/session, open provider-hosted checkout, handle return/cancellation, verify payment server-side and by authenticated webhook, prevent duplicate crediting, and update balance/history/receipt only after verified successful payment.
- [x] Use sandbox credentials **only for Demo/test**, and production credentials **only for Live**. Follow actual payment-provider merchant eligibility and financial-service restrictions; if Live merchant activation is unavailable, report the exact blocker instead of faking success.
- [ ] Test gateway selection, credential configuration, checkout initiation, success, failure, cancellation, webhook replay, duplicate events, and balance updates. **Do not mark this fixed until the configured gateways run end to end.**

## Completion
Implement all changes, run relevant tests/type checks/build, and report files modified, outcomes verified, and any remaining provider/credential blockers. **Do not stop at a plan or UI-only implementation.**

## Verification and remaining blockers

Twelve requirements are implemented and verified. The three gateway requirements remain unchecked: the checkout implementation and controlled-provider tests are complete, but actual provider checkout and webhook delivery cannot be verified without configured credentials. Both sandbox and Live are missing Stripe publishable/secret/webhook keys and PayPal client ID/secret/webhook ID. Live wallet funding also requires an approved settlement integration; merchant checkout credentials alone do not enable it.

See [CHANGES-VERIFICATION.md](CHANGES-VERIFICATION.md) for test results, verified behavior, and the modified-file inventory. No Git changes, diffs, or history were inspected.
