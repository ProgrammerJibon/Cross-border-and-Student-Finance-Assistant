# Finance implementation — 2026-10-25

Scope: same-environment internal user transfers, Gateway/Manual Add Money,
admin-managed withdrawals, and family/tuition planning. Preserve historical
transactions and the installed Next.js application.

Execution sequence:
1. Review existing source inventory, financial services, migrations, UI, docs and tests.
2. Enforce beneficiary/family eligibility at draft and execution; disable external sends.
3. Add environment-scoped receiving accounts, manual funding, withdrawal holds,
   evidence-bound review, family funding requests, and privacy-aware discovery.
4. Connect responsive forms and operational queues; retain drafts and explicit confirmation.
5. Add protected administrator bootstrap and mandatory credential/MFA setup.
6. Verify additive migrations, adversarial/concurrent operations, UI, types, lint and build.
7. Document actual results, outstanding adapters/approvals, and deployment controls.

Existing isolation migration quarantines unverified historical Live balances and
blocks Live balance writes in the database. Retain that protection. Neither a
configuration switch, redirect, operator reference, nor user proof is settlement
evidence. Live funding/custody/payout capabilities remain unavailable until a
trusted reconciliation adapter and financial authorization are deployed. Existing
merchant subscription checkout is a separate capability.
