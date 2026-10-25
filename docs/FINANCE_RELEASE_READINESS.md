# Finance implementation and release readiness

Updated 2026-10-25. This is an implementation in the existing application, not a new project. **Not approved or ready to launch real-money services.** The new operational workflow runs in Demo; Live financial operations fail closed. A payment credential or configuration flag cannot unlock an absent settlement adapter.

## Delivered

- Internal-only sends: removed executable external remittance/tuition sends; retained historical records and Demo self-wallet conversion. Every non-family recipient needs an approved beneficiary, including small sends. Recipient status, environment, ownership, beneficiary and family eligibility are checked again at execution.
- Accepted parent/student links allow direct sends both ways. Students with the same accepted active parent are eligible family recipients. Shared children do not imply consent between two parents; parent-to-parent sends require a beneficiary.
- Exact normalized email lookup and bounded case-insensitive name suggestions, opt-in discoverability, masked email hints, debounce and per-user database rate limits. Recipient selection resolves the actual server identity. Existing non-discoverable Live users must opt in themselves.
- Family funding requests are separate from ledger transfers: pending, approved awaiting funds, declined, cancelled, expired, and paid. A request never debits a parent. Approval and final send are separate actions. The request row and stable transfer key prevent competing approvals/sends from posting twice.
- Shared two-step Add Money dialog with owned-wallet and currency validation, Gateway/Manual selection, receiving-account details, sender details and transaction ID. Manual submissions remain pending. Stripe and PayPal are the only gateway choices. Demo gateway completion is explicitly simulated; Live wallet gateway buttons explain the unavailable capability.
- Five encrypted Demo receiving-account samples: UnionPay/Alipay in CNY and bKash/Nagad/Rocket in BDT. Live has no automatic sample accounts. Admin receiving-account management supports creation, configuration, ordering, deactivation and audited changes. Payment identity/currency changes require a new account to protect historical reconciliation. Live publication remains blocked.
- Manual withdrawal dialog offers six methods with identifier validation. Available funds move into reserved funds atomically. Cancellation/rejection releases the hold once. Parent controls are preserved. Admin processing, protected detail disclosure, evidence recording, and a separate verification step are implemented in Demo. Live reference-only completion is rejected.
- Encrypted sender/destination/evidence fields, scoped queues, immutable operation identity and journals, balanced postings per currency/phase, duplicate transaction-ID protection, and payload-bound retry keys. The existing ledger is retained and its reservations now appear alongside new withdrawal reservations.
- English, Simplified Chinese and Bengali copy for new workflows; existing theme/layout/components retained. Non-sensitive drafts survive refresh/back/cancel in owner/environment-scoped session storage. Sensitive payment identifiers are deliberately not written to browser storage. Resuming a draft always requires another confirmation.
- AI family discovery/support tools and confirmed support-request proposals. Funding and payout identifiers remain in secure forms. AI uses the same internal-transfer policy and cannot activate Live rails. Tuition forecasts distinguish pending deposits and expected family support from available funds; no family transfer marks university tuition paid.
- Protected one-time Live admin bootstrap for the requested identity. Reserved registration email; bcrypt hashing; no password in scripts/examples/logs; mandatory password rotation and TOTP enrollment; login replay protection; no credential reset or privilege escalation on rerun. Bootstrap regression tests use an isolated database and unrelated random test passwords.

## What is still blocked or incomplete

**Live wallet funding, internal wallet transfers and manual payouts remain disabled in services and database triggers.** Existing Stripe/PayPal code supports hosted provider checkout and verified provider responses for separate merchant subscription collection, subject to configuration. This release does not turn merchant checkout into approved stored value or cash-out.

The following are genuine remaining implementation/operational requirements, not passed tests:

1. An approved funding/custody partner, applicable jurisdictions, legal/regulatory assessment, safeguarding accounts and documented authorization for each wallet capability.
2. Trusted bank/provider settlement statement ingestion and matching, settlement availability/risk policy, independent high-risk review, protected evidence retention, chargeback/reversal posting and recovery. Operator-entered references and Demo evidence do not satisfy this requirement. The current integrity job detects local inconsistencies; it does not reconcile an external bank statement.
3. Approved Live Stripe/PayPal wallet-funding merchant configurations, credentials, supported countries/currencies, authenticated webhook/return-path testing, delayed settlement, refunds and dispute tests against those accounts. No live provider payment or payout was performed.
4. Identity/KYC/KYB, sanctions/AML screening, financial monitoring and dispute/complaint operations with real authorized partners. No unimplemented compliance service is represented as available.
5. Currency storage currently supports zero/two minor units. Three-decimal currencies are explicitly rejected by the new wallet flow. Genuine FX execution remains unavailable in Live.
6. Full end-to-end coverage of all 45 requested acceptance cases, all old browser flows, all device/locale combinations, independent security/accessibility review, load testing and operational recovery drills. Protected-account MFA recovery needs an operator identity-verification process; no unsafe public bypass was added.

## Acceptance matrix

`Implemented/tested` refers to the specified automated boundary or Demo workflow, **not** real financial authorization.

| Requested cases | Status and evidence |
|---|---|
| 1–5: isolation, zero opening funds, reset, forged environments | Existing guards retained; database/service integration tests pass. New operations and receiving accounts add matching boundaries. |
| 6: four internal directions | Demo service tests pass; Live execution blocked. |
| 7–9: beneficiary and discovery | Implemented and service-tested. Exact-name and prefix ranking; ten results per page, up to five pages per query, with rate limits and masked emails. |
| 10–14: family exemptions, revoked/stale relationships | Direct parent/student and sibling paths tested; parent-to-parent uses explicit beneficiary policy. Revocation/stale beneficiary execution is rejected. |
| 15–17: support requests and payment | Separate approval/send, unrelated-parent rejection, decline, single payment tested. Expiry and shortage code implemented; not every UI permutation tested. |
| 18: concurrent sends | Existing concurrent confirmation tests pass; new concurrent withdrawal and family-send tests pass. |
| 19–20: Add Money | Owned-wallet validation and two-step modal implemented; browser manual flow passes. Live gateways shown unavailable. |
| 21: genuine hosted wallet funding | Blocked: no authorized Live wallet-funding adapter; popup/return recovery for Live wallet funding is unverified. |
| 22: fake callbacks/redirects/replays | Existing signature, canonical-provider-response and replay tests pass. Live wallets cannot credit through these paths. |
| 23: verified Live credit and reversals | Blocked/incomplete pending trusted settlement and dispute adapters. |
| 24–27: samples, isolation, sender data, pending deposit | Implemented; service tests and manual-deposit browser flow pass. |
| 28: unauthorized/reference-only credit | Rejected. Privilege, duplicate reference, wrong amount and cross-environment tests pass. |
| 29: actual manual receipt and one-time Live credit | Demo one-time posting tested; actual receipt verification/Live posting blocked. |
| 30–33: withdrawals and holds | Six methods, validation, reservation and release implemented. Core service and cancellation browser checks pass. |
| 34–35: actual payout evidence | Reference-only Live completion cannot succeed. Demo evidence review works; external verification/independent high-risk review is not implemented for Live. |
| 36: admin isolation | Same-environment permissions and MFA guards; unauthorized/cross-environment service tests pass. |
| 37: bootstrap | Idempotency, non-hijacking and password preservation tested. Rotation/TOTP setup implemented; RFC vector/replay unit tests pass. |
| 38–39: funding shortage and resumption | Explicit confirmation, shortage and retained-draft code implemented. Existing underfunded-draft integration tests pass; full interrupted-browser permutations remain untested. |
| 40: AI | Role/ownership tests pass; policy enforced by shared service. Actual live AI test skipped. |
| 41: planner | Pending versus available data separated; direct external tuition execution blocked. No official university verification adapter. |
| 42: outages/conflicts/disputes | Provider error/signature/replay and concurrency tests pass; full external outage/refund/chargeback behavior remains unverified. |
| 43: responsive/accessibility/locales | Shared accessible modal/form primitives and three translations; tested mobile overflow in one browser workflow. Not a comprehensive accessibility/localization certification. |
| 44: migration preservation | Fresh isolated schema, migration replay and historical-balance quarantine tests pass. Existing rows retained. |
| 45: checks | Actual results below; skipped/live checks are not counted as passing. |

## Verification results

- Unit suite: **37 passed, 0 failed**.
- Full isolated integration suite: **43 passed, 0 failed, 1 skipped** (live Gemini; no configured test model).
- Focused browser suite: **4 passed, 0 failed**, covering pricing/Demo/navigation, Live checkout isolation, landing-only logos, and wallet/admin review.
- New browser flow: manual deposit → pending → admin processing/evidence/verification → withdrawal reservation/cancellation, plus 390px overflow check, passed after fixing missing translated labels.
- TypeScript and ESLint passed. Production Next.js build and standalone packaging passed; packaged output excludes dotenv files.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities** at verification time.
- Development navigation produced intermittent Next stream-abort log messages; browser assertions passed. No assertion of a clean independent runtime/security audit is made.
- Fresh isolated database migration replay preserves historical Live amounts in quarantine and preserves a user's discovery opt-out. The configured local database was backed up under ACL-restricted `.local/backups/`, migrated, and the requested Live administrator was provisioned through protected process input. No bootstrap password was copied to code or logs. Local reconciliation returned zero discrepancies and `providerSettlementVerified:false`.

## Follow-up corrections in this review

- Migration replay no longer re-enables Demo account discovery after a user opts out.
- Withdrawal cancellation and parent rejection now require an actual reservation release before recording success. The existing payment engine also checks affected rows when holding or releasing funds. A regression test corrupts a fixture reservation and verifies atomic rejection without a false release journal.
- Only the assigned operator can record settlement evidence. A separate authorized reviewer can still verify the simulated evidence. This is not a replacement for the missing Live independent-settlement adapter.
- Recipient discovery now ranks exact and prefix name matches and supports bounded pagination; tests cover distinct pages, exact-name ordering and invalid page rejection.
- Funding recovery retains the original payout method, request/currency context and receiving-account choice. Network interruptions have translated recovery messages. Sensitive payout identifiers still require re-entry after a refresh; full encrypted server-side draft retention remains incomplete.
- Pending-parent withdrawals expose the existing owner cancellation action.
- Repaired unreadable Chinese/Bengali strings, including the Demo/Live notices, funding recovery, subscription and agent copy. The repair script uses UTF-8 source.
- UnionPay, Stripe, Alipay, WeChat Pay, PayPal, Visa and Mastercard logos appear only on the main landing page. `/` retains its existing locale redirect (`/en`, `/zh-CN` or `/bn-BD`). The strip is absent from pricing, features and login in browser checks; it is not rendered in the shared workspace layout. Copy does not advertise unconfigured integrations or partnerships.
- The first integration rerun exposed pending AI fixtures interfering with Demo reset. Fixture cleanup now ends both pending and running test runs. The reset safety guard remains enforced. The final integration result above supersedes that failed run.

Additional changed files in this review: recipient and wallet services/actions/UI, payment reservation checks, wallet migration and test provisioning, public-page/logo components, all three dictionaries, `scripts/repair-localization.mjs`, agent/wallet integration tests, landing/browser assertions and Playwright configuration. Existing working-tree finance work was preserved. The requirements file was not edited.

## Review and change inventory

The [review inventory](REPOSITORY_REVIEW_2026-10-25.md) records automated content inspection across source, schema/migrations, tests, docs and configuration. Targeted manual review covered the financial services/actions, auth/session, family consent, provider verification, reset, ledger, UI and test boundaries. It is not a claim of exhaustive line-by-line human review. The [execution notes](FINANCE_EXECUTION.md) record scope and ordering. The original user-edited requirements file was not modified by this implementation.

Primary new modules: [wallet workflows](../src/services/wallet-workflows.service.ts), [recipient policy](../src/services/recipient.service.ts), [family requests](../src/services/family-funding.service.ts), [wallet UI](../src/components/payments/wallet-workspace.tsx), [migration](../scripts/wallet-workflows-migration.mjs), [security setup](../src/actions/security.actions.ts), and [bootstrap command](../scripts/bootstrap-live-admin.mjs). Existing payment, auth, AI, family, tuition, reset, reconciliation and test code was updated. See Git working changes for the exact modified-file list.

## Deployment and operations

1. Take an encrypted database backup and test restoring it into an isolated instance. Preserve encryption keys separately. Losing the encryption key loses access to stored receiving/payout/evidence details.
2. Run `npm run db:migrate` during a maintenance window using a migration principal with DDL/TRIGGER rights. New installations must also run the migration chain after importing the base schema. The new migration is additive and replay-tested. Do not drop isolation triggers or restore unverified historical Live amounts into available funds.
3. Use separate runtime and migration database principals. Runtime credentials must not have DDL/TRIGGER privileges. Limit data access to the application tables. Keep audit/journal history append-only and restrict database-console access.
4. Supply runtime secrets through protected deployment configuration. Keep Demo/test credentials separate from Live secrets. `.env.local` and `.env.production` are currently ignored/untracked but existed in Git history. Rotate exposed historical secrets, revoke sessions and rotate provider secrets through their providers. History rewriting requires a separately coordinated repository operation.
5. Keep `LIVE_PAYMENTS_ENABLED=false` and `PAYMENTS_SUSPENDED=true` until separately approved merchant subscription configuration is required. These switches do not enable wallet funding or payouts. Set `DEMO_MODE` deliberately and make Demo labels visible. Never send real funds to example receiving details.
6. Configure Stripe/PayPal webhooks at `/api/billing/stripe` and `/api/billing/paypal` with environment-specific signing secrets, canonical server verification and event deduplication. Validate in the applicable provider dashboard. Wallet-funding launch still requires the missing settlement adapter; a successful subscription checkout is not evidence of wallet-funding approval.
7. Run the protected bootstrap from the repository root using `powershell -File scripts/bootstrap-live-admin.ps1`, or inject `FINBRIDGE_BOOTSTRAP_PASSWORD` into the CLI's temporary process environment. Never pass the password as a command argument or store it in an example env file. Existing unrelated identities cause failure, not elevation. First login requires a new password and authenticator enrollment. Treat the supplied initial password as exposed and temporary.
8. Build with `npm run build`; run the standalone server behind HTTPS with the correct `APP_URL`/`CHECKOUT_BASE_URL`, database connectivity and secret injection. The packaged artifact excludes dotenv files. Do not expose MySQL or secret-management endpoints publicly.
9. Schedule `npm run finance:reconcile` using an external scheduler (for example every five minutes) and alert on nonzero exit status. It detects unbalanced journals, mismatched reservations, stale checkouts/webhooks and unverified Live balances. It never repairs history or certifies external settlement. Monitor application error rates, failed logins, queue age, duplicate references and reconciliation exceptions without logging private payment details.
10. On an incident, suspend provider operations, disable affected receiving accounts and stop payment workers. Preserve evidence and holds while reconciling uncertain disbursements. Never automatically refund an uncertain external payout. Restore only from a verified backup with transaction-log recovery and reconcile provider balances before reopening operations.
11. Roll back application code only with a schema-compatible release. Retain additive tables and immutable records; do not reverse ledger postings by deleting rows. Newer reservations must be drained/reconciled before running an older engine. No production deployment or external payment was executed during this task.

CI retains the existing MariaDB service and now includes new workflow and bootstrap integration tests plus the focused browser flow. Production authorization remains an external gate; a green CI run does not supply it.
