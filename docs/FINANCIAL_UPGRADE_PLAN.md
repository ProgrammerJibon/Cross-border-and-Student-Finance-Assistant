# Financial isolation implementation plan

The existing Next.js/MySQL application remains the implementation base. Preserve
the payment request engine, AI provider protocols, family permissions, localization,
and Demo fixtures. Installed Next.js data-security and standalone-output guidance
applies; server actions are public authorization boundaries.

## Audit findings

- Checkout accepts a client-selected sandbox/live environment for real identities.
- Onboarding accepts arbitrary opening wallet balances and paid tuition amounts.
- Legacy internal transfers, withdrawals, bank deposits and manual settlement do
  not restrict execution to Demo. Legacy remittance execution has the same issue.
- Provider capture currently credits wallets without settlement/risk evidence.
- Recipient discovery lacks matching account environments; family guards are
  present in some actions but lack database enforcement.
- Demo administrators can read and change global configuration and Live records.
- Provider errors can log raw response bodies. `.env.local` is tracked, including
  in repository history. The build copies environment files into standalone output.
- Existing financial integration tests create non-Demo users with simulated funds;
  fixtures must explicitly identify their environment.

## Execution order

1. Server-derived immutable domain, service guards, zero Live opening balances,
   privacy boundaries, Demo-only simulation and manual settlement.
2. Additive migration: preserve legacy amounts and records, enforce ownership and
   environment relationships, reject Live writes through legacy financial engines.
3. Account-bound provider checkout, explicit merchant capability approvals,
   credential isolation, canonical verification, durable webhook deduplication and
   reconciliation exceptions. No checkout/capture is a wallet settlement.
4. Funding-gap recovery and truthful UI/AI context; separate projected, recorded,
   and available funds. Preserve transfer drafts; require confirmation again.
5. Regression tests, isolated database migration tests, typecheck, lint, build,
   browser verification and deployment/rotation/release documentation.

## Activation boundary

No custody, remittance, payout, bank funding, university settlement, KYC/sanctions
partner or jurisdiction authorization is evidenced by this repository. Live wallet
movement remains disabled. A configurable flag alone cannot enable an unimplemented
rail. Stripe and PayPal merchant subscription collection is a separate capability,
requiring production credentials and an explicit merchant/country/currency approval.
No automated test may make a real payment or use real provider credentials.

## Verification

Exercise both directions of cross-domain attacks, zero balances, immutable domain,
legacy amount preservation, manual settlement denial, provider environment mismatch,
webhook replays, concurrent Demo transfers, funding draft persistence, family privacy,
AI service enforcement and Demo reset isolation. Report blocked and skipped checks
separately from passed tests. Technical readiness is not financial launch approval.
