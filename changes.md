# FinBridge AI — Full Production-Grade FinTech Upgrade

## Mission

Upgrade the existing **FinBridge AI** application into a secure, reliable, production-grade **Student & Parent Finance Management, Tuition Planning, and Real-Money Transfer Platform**. And don't waste tokens for unnecessary research and thinking.


This is an upgrade to the existing application, NOT a new project.

**Your primary objective is to completely separate Demo and Live environments while making Live accounts capable of genuine, provider-backed financial operations.**

Do not implement fake financial operations in Live mode.

Do not confuse a successful API request, simulated ledger entry, manually entered refer ence, or checkout redirect with a completed real-money transfer.

# Plan first, execute when ready

### 1. Mandatory Repository Review

Before making changes:

1. Inspect the complete current repository, all source files, directories, database definitions, migrations, tests, documentation, and configuration.
2. Read `README.md`, `AGENTS.md`, `IMPLEMENTATION_STATUS.md`, and all files under `docs/`.
3. Review all current implemented features, business rules, permissions, and dependencies.
4. Identify completed, partially implemented, broken, insecure, and sandbox-only functionality.
5. Preserve existing functional features and improve them rather than rebuilding them unnecessarily.
6. Follow the installed Next.js version's actual documentation and project conventions.
7. Identify every place where Demo and Live users share financial logic without adequate isolation.

Pay particular attention to:

- `src/services/payment.service.ts`
- `src/services/sandbox-payment.service.ts`
- `src/services/checkout-provider.service.ts`
- `src/services/billing.service.ts`
- `src/services/gateway-config.service.ts`
- `src/services/demo-reset.service.ts`
- `src/actions/auth.actions.ts`
- `src/actions/payment.actions.ts`
- `src/actions/topup.actions.ts`
- `src/actions/transfer.actions.ts`
- `src/actions/checkout.actions.ts`
- `src/actions/parent.actions.ts`
- `src/actions/agent-workflow.actions.ts`
- `src/components/payments/`
- `src/components/billing/`
- `database/schema.sql`
- Existing migration scripts and integration tests.

Known problems include the checkout UI defaulting to sandbox, environment selection controlled by the user, shared internal-recipient lookup without explicit Demo/Live matching, and legacy financial workflows that still rely on simulated operations or manually completed settlement.

Fix these issues comprehensively.

## 2. Completely Independent Demo and Live Environments

Demo and Live represent **two entirely separate financial worlds**.

### Demo Environment

Demo is exclusively for exploring and testing FinBridge AI before registering for a real account.

Demo users must be able to:

- Access preconfigured sample wallets and virtual balances.
- Connect exclusively with other Demo users.
- Add Demo contacts and beneficiaries.
- Link Demo students with Demo parents.
- Request, approve, release, receive, and transfer virtual funds.
- Simulate deposits, withdrawals, subscriptions, and tuition payments.
- Test parent approval and administrative settlement workflows.
- Test financial planning, budgets, invoices, notifications, and the AI Agent.
- View simulated receipts and transaction histories.
- Reset their Demo data using the existing reset functionality.

All Demo financial operations must be clearly labelled **SIMULATED — NO REAL MONEY**.

Demo wallets must never contain real user funds.

Demo users must never interact financially with Live users, receive real payments, access live payment credentials, or create real financial settlements.

Existing Demo profiles and seeded data should remain functional.

### Live Environment

Live is the actual financial environment.

Live users must:

- Register independent real accounts.
- Start with zero available financial balance.
- Connect exclusively with Live accounts.
- Create real parent–student relationships.
- Add and verify beneficiaries.
- Deposit through approved real payment providers.
- Transfer money using approved real payment rails.
- Receive funds through genuine settlement workflows.
- Withdraw through approved payout systems.
- Pay tuition using genuine approved financial integrations.
- Track actual financial activity and balances.
- Receive real transaction notifications, receipts, and relevant financial alerts.

**Live accounts must never receive simulated, seeded, promotional, or automatically generated monetary balances.**

A newly registered Live account must have zero available funds until a legitimate credit is verified.

### Mandatory Isolation

Enforce separation across:

- Authentication and authorization
- User discovery and search
- Contacts and connections
- Parent–student links
- Beneficiaries
- Wallets and accounts
- Balances and financial ledgers
- Transaction requests and approvals
- Payment gateways and credentials
- Deposit and payout operations
- Subscriptions and entitlements
- AI Agent actions
- Notifications and receipts
- Administrative operations
- Reporting and analytics

Create an immutable server-controlled account environment or equivalent reliable domain boundary.

Never trust a frontend-supplied `environment`, `is_demo`, account ID, recipient ID, or provider identifier as proof of authorization.

Enforce cross-environment restrictions in the service layer, queries, and database constraints wherever appropriate.

Use a shared immutable environment on financial records, with validated relationships and compatible account ownership.

Reject all cross-environment relationships and transactions.

An administrator may oversee both environments only through explicitly separated operational views. Demo administrators must never initiate or approve Live fund movements.

### Demo-to-Live Journey

Demo users may register for Live accounts.

Registration must create a new Live identity and independent financial workspace.

Do not migrate simulated money, transactions, payment methods, financial approvals, or financial histories into Live.

Allow copying nonfinancial preferences only with explicit user consent.

Remove user-facing payment-environment switching from Live checkout flows. The system determines its environment from the authenticated account.

## 3. Real Financial Infrastructure

Refactor the financial architecture into two independent execution models:

**DEMO:** Simulated financial engine.

**LIVE:** Authorized, provider-backed financial engine.

Use a clear payment abstraction with provider adapters, capability checks, and verified state transitions.

Live financial operations must never call a sandbox execution service.

A payment gateway's ability to accept merchant payments does not automatically authorize peer-to-peer transfers, wallet funding, international remittance, or customer payouts.

Before enabling each Live feature, verify that the actual merchant account, jurisdiction, payment provider, financial partner, and business model support the intended financial activity.

Where licenses, approved partnerships, production credentials, or permissions are missing, implement the production integration and keep that operation disabled with a clear configuration or authorization requirement.

Never simulate successful Live transactions to compensate for missing integrations.

## 4. Real Payment Gateway Integration

Review and improve the existing payment provider infrastructure.

Integrate eligible production payment services, including:

- PayPal
- Stripe
- UnionPay
- Alipay
- WeChat Pay
- Bank transfers and approved wire-transfer partners
- Other officially supported payment methods appropriate for the account's country

Support Bangladesh payment providers, such as bKash or Nagad, only through authorized commercial integrations when available and approved for the intended use.

Use real production APIs, provider-hosted checkout, secure authentication, and validated payment confirmation.

Implement a provider capability matrix based on merchant country, customer country, currency, operation type, merchant account status, and authorization.

Do not display unsupported methods as available.

Do not claim direct UnionPay, Alipay, or WeChat integration when the implementation actually uses another processor. Display the true processor and underlying payment method accurately.

Production credentials must remain encrypted or stored in an approved secrets manager.

Sandbox credentials and Live credentials must be completely isolated.

### Live Deposit Requirements

When adding real money:

1. Select the destination wallet.
2. Choose the amount and currency.
3. Display available, eligible payment methods.
4. Calculate the actual fees, currency conversion, and credited amount.
5. Open the real provider's secure checkout or approved bank funding workflow.
6. Receive and validate the provider response.
7. Independently verify payment through the trusted provider API and authenticated webhooks.
8. Track pending, captured, settled, failed, reversed, and refunded states.
9. Credit available wallet funds only when the settlement and risk rules permit.
10. Generate a genuine receipt and audit record.

**Never credit Live balances based solely on a user-entered transaction reference, uploaded screenshot, checkout redirect, or frontend success response.**

For bank deposits, reconcile verified bank records or approved provider notifications before releasing funds.

Implement proper webhook authentication, event deduplication, replay protection, idempotency, dispute handling, and reconciliation.

Never store raw card numbers, CVV, or sensitive payment credentials.

Use hosted, provider-controlled payment collection and tokenization where supported.

## 5. Real-Money Transfers

FinBridge AI is no longer only a tuition planner.

It must function as a full student-and-parent financial management and money-transfer platform within the limits of its authorized payment and remittance partnerships.

Implement the following supported Live transfer workflows:

- Student-to-student transfers
- Parent-to-student transfers
- Student-to-parent transfers
- Parent-to-parent transfers
- Approved beneficiary transfers
- Domestic transfers
- Authorized international transfers
- Bank or wire payouts
- Supported external wallet payouts
- University tuition payments
- Personal and family financial assistance

Internal wallet transfers may execute atomically when the platform has legally valid, settled, available funds and an authorized ledger/settlement structure.

External transfers require actual payment or payout partner execution.

Do not replace real provider settlement with an internal database balance change.

Implement genuine quotes, destination verification, fees, conversion rates, recipient details, transfer limits, approval checks, and settlement tracking.

Show the actual execution status:

- DRAFT
- WAITING_FOR_FUNDS
- WAITING_FOR_APPROVAL
- AUTHORIZED
- PROCESSING
- PENDING_SETTLEMENT
- COMPLETED
- FAILED
- CANCELLED
- REVERSED
- REFUNDED

Every status transition must represent a verified event.

Do not mark a Live transaction as completed merely because an administrator entered a reference.

Where approved partners allow manual settlement, require authorized operator controls, evidence of the actual payout, independent verification, and auditable approval.

## 6. Insufficient Balance and Automatic Deposit Assistance

Implement an intelligent insufficient-balance experience.

Whenever a user attempts to send or withdraw more than their available balance:

1. Detect the shortage server-side.
2. Display the available balance and required amount.
3. Calculate the exact funding shortage, including applicable fees.
4. Offer **Add Money** directly within the transfer workflow.
5. Display all eligible real funding providers.
6. Open the selected provider's secure payment process.
7. Verify the actual financial settlement.
8. Update the wallet.
9. Restore the original transfer draft and recipient information.
10. Revalidate the balance, fees, quote, beneficiary, parental permissions, and risk policy.
11. Require the user's explicit confirmation before executing the original transfer.

Do not silently execute the transfer merely because a deposit succeeded.

Handle expired quotes, incomplete payments, additional authentication, currency fluctuations, failed deposits, browser interruptions, and refunds.

Apply the same workflow to the AI Agent when it prepares an underfunded transfer.

For Demo users, perform the entire flow using virtual funds and simulated providers only.

## 7. Production Financial Ledger

Audit and strengthen the existing ledger implementation.

Implement a trustworthy, immutable, double-entry accounting architecture for Live money.

Support:

- Separate available, pending, and reserved balances.
- Multi-currency accounting.
- Correct currency minor units and decimal precision.
- Transactional balance changes.
- Atomic internal transfers.
- Fund reservation and release.
- Idempotent payment execution.
- Unique external transaction identifiers.
- Chargeback and reversal entries.
- Provider settlement reconciliation.
- Suspense and clearing accounts.
- Transparent financial adjustments.
- Immutable audit history.
- Concurrent transfer protection.
- Prevention of negative available balances.
- Scheduled reconciliation and discrepancy alerts.

Never edit historical ledger entries to correct balances. Use traceable compensating transactions.

Do not allow arbitrary SQL updates, administrative controls, AI actions, or frontend requests to create unverified Live balances.

Ensure database migrations preserve existing records.

## 8. Student and Parent Financial Platform

Review all currently implemented functionality and complete missing or broken workflows.

### Student Features

Provide integrated management for:

- Real multi-currency wallets
- Money transfers and receipts
- Account funding and withdrawals
- Tuition invoices and deadlines
- University payment information
- Semester fee planning
- Scholarship records
- Tuition funding gaps
- Living expenses
- Accommodation and rent
- Monthly and yearly budgets
- Spending analytics
- Beneficiaries
- Parent connections
- Funding requests
- Financial notifications
- Transaction history
- Subscription management
- AI financial assistance

### Parent Features

Provide:

- Independent Live wallets
- Approved student connections
- Direct financial support
- Tuition contributions
- Student funding requests
- Transfer approvals
- Spending allowances
- Daily and monthly limits
- Automatic approval policies
- Family budgets
- University payment tracking
- Transaction visibility based on permission
- Scheduled transfers through authorized providers
- Emergency funding workflows

Preserve student financial independence.

Parent controls must be explicitly authorized and must never bypass user consent, privacy permissions, or platform risk rules.

Keep the existing medium-value transfer and non-beneficiary policies where permitted, while ensuring all required safeguards are enforced server-side.

### Tuition Planner

Make tuition planning an integral part of financial management rather than a disconnected calculator.

Connect tuition invoices, deadlines, family contributions, current available funds, realistic funding forecasts, authorized payment options, and completed university payments.

Distinguish projected money from settled, available money.

Do not label a tuition obligation as paid without trusted confirmation from the relevant payment processor or university.

## 9. AI Agent Integration

Upgrade the existing AI Agent without discarding its implemented provider integrations or conversation architecture.

Preserve Gemini, OpenAI, Claude, and supported compatible models.

The AI Agent must understand whether the authenticated user is Demo or Live.

It must never cross financial environments.

Support authorized functions for:

- Balance and transaction inquiries
- Tuition affordability analysis
- Budget assistance
- Funding-gap calculations
- Beneficiary discovery
- Payment preparation
- Transfer quotations
- Parent approval requests
- Insufficient-balance detection
- Deposit preparation
- Transaction-status tracking
- Spending summaries
- Financial notifications

Continue to use structured tool calls and existing server-side financial services.

Maintain conversation history and context.

Never give the model direct unrestricted SQL access or direct control of payment credentials.

Require explicit user confirmation for every real financial action.

Validate every tool call against ownership, account environment, permissions, available funds, payment-provider capability, and current financial state.

AI-generated responses must not fabricate balances, successful transactions, provider confirmations, or settlement references.

## 10. Administrative and Financial Operations

Upgrade the Admin and Moderator panels into operational dashboards for a real financial product.

Implement or improve:

- Separate Demo and Live financial monitoring
- Live payment gateway configuration
- Provider health and connection status
- Merchant and payout account authorization status
- Payment and settlement reconciliation
- Transaction investigation
- Failed transfers and refunds
- Chargebacks and disputes
- Approval queues
- KYC and identity verification workflows
- AML and fraud monitoring
- Suspicious transaction reporting
- Beneficiary risk checks
- Customer account restrictions
- Provider transaction evidence
- Audit trails
- Financial reports
- Treasury and liquidity monitoring
- Role-based administrative permissions

Require stronger authorization, MFA, separation of duties, and dual approval for high-risk financial operations.

Never expose production credentials or private payment details in ordinary admin responses.

Do not give Demo administrators authority over real financial funds.

## 11. Compliance and Production Security

Treat FinBridge AI as a regulated-finance product, not a normal demo website.

Determine the operational jurisdictions and assess the requirements for custody, wallet funding, money transmission, remittance, FX, and payouts.

Document required approvals, licensing, banking partnerships, and provider restrictions.

Include appropriate controls for:

- KYC/KYB
- AML/CFT
- Sanctions screening
- Transaction monitoring
- Customer and beneficiary verification
- Data privacy
- Secure document storage
- PCI DSS scope reduction
- MFA and secure account recovery
- Session security
- Rate limiting
- CSRF/XSS/SQL injection prevention
- Financial API authorization
- Secure webhooks
- PII encryption and retention
- Fraud prevention
- Incident monitoring
- Secret rotation
- Audit logging
- Disaster recovery
- Backup and restoration

The repository currently tracks `.env.local`. Audit the repository and history for exposed secrets, ensure environment files are excluded from future commits, document safe credential rotation, and prevent additional disclosures.

Never print secrets to logs or reports.

Keep Live fund movement disabled until all mandatory operational and regulatory requirements are satisfied.

## 12. User Experience and Production Design

Preserve the existing design system while upgrading usability and reliability.

Keep:

- Next.js architecture
- Existing database technology
- React frontend
- Current theme support
- English, Simplified Chinese, and Bengali localization
- Student, Parent, Admin, and Moderator roles
- Existing responsive layouts
- Existing AI Agent functionality

Make financial operations intuitive on desktop and mobile.

Clearly distinguish Demo and Live throughout the interface.

Live users must not see sandbox controls, test cards, fake money, or simulated transaction messages.

Show accurate fees, exchange rates, available balance, pending money, and real transaction status.

Provide useful error messages, recovery actions, progress indicators, and verified receipts.

Ensure successful operations refresh all relevant balances, transaction histories, notifications, and parent dashboards.

## 13. Database and Migration Requirements

Inspect the entire current database schema.

Create safe additive migrations for any necessary:

- Environment identifiers
- Financial accounts
- Ledger structures
- Provider transactions
- External payout records
- Reconciliation records
- Beneficiary verification
- Settlement status
- Compliance status
- Disputes and reversals
- Provider configuration
- Audit records

Do not delete existing tables or financial data without a documented, safe migration strategy.

Backfill historical records conservatively.

Do not treat historical simulated balances as real money.

Preserve existing Demo data and ensure that seeded financial records cannot become Live funds.

Migrations must be repeatable, tested, and suitable for existing deployments.

## 14. Testing and Production Verification

Do not consider the project finished until comprehensive verification is complete.

Extend the existing unit, integration, and Playwright suites.

Mandatory scenarios include:

1. Demo users cannot transfer to Live users.
2. Live users cannot transfer to Demo users.
3. Cross-environment searches and connections are rejected.
4. Live registration creates zero monetary balance.
5. Demo simulated deposits never credit Live money.
6. Live deposits require verified provider confirmations.
7. Missing payment credentials never trigger fake success.
8. Sandbox transactions never satisfy Live payment requests.
9. Replayed webhooks cannot double-credit balances.
10. Concurrent transfers cannot double-spend money.
11. An insufficient-balance transfer correctly offers funding.
12. Failed funding cannot release a transfer.
13. Successful funding restores the original transfer draft.
14. Parent controls cannot be bypassed.
15. Unauthorized administrative settlement is blocked.
16. Refunds and chargebacks create correct financial reversals.
17. Network failures do not result in incorrect completion.
18. AI tools cannot bypass financial authorization.
19. Tuition planning reflects real available funds.
20. Provider outages produce recoverable transaction states.
21. Live subscription upgrades require verified Live payments.
22. Demo resets cannot modify Live records.
23. Provider settlement reconciliation identifies discrepancies.
24. Database upgrades preserve existing user and financial data.

Run the existing test commands, TypeScript checks, ESLint, production build, and browser end-to-end suites.

Use only Demo data, provider test environments, and authorized fixtures for automated payment tests.

Do not initiate real-money test transactions without explicit authorization.

Report skipped tests and missing credentials accurately.

## 15. Release and Deployment Preparation

Review the current production build, standalone output, environment variables, database configuration, and hosting requirements.

Prepare:

- Production environment configuration
- Separate Demo and Live credential configuration
- Provider webhook setup
- Database migration instructions
- Secure deployment documentation
- Automated CI verification
- Operational monitoring
- Backup and recovery procedures
- Financial reconciliation jobs
- Security and compliance checklists
- Feature flags and emergency payment suspension
- Provider outage handling
- Rollback procedures
- Production readiness tests

Never copy development secrets into deployment artifacts.

Ensure the platform fails safely if a required payment provider, compliance capability, or funding partner is unavailable.

### Production Acceptance Criteria

The implementation is technically ready for a controlled Live launch only when:

- Demo and Live environments are provably isolated.
- Live users start with zero funds.
- Real deposits are verified through authorized production providers.
- Real transfers use authorized financial rails.
- No fake transaction can affect real money.
- Every financial mutation is auditable and idempotent.
- Parent and student permissions are enforced.
- Financial reconciliation works correctly.
- The AI Agent uses secure, confirmed transactions.
- All required technical tests pass.
- Provider and regulatory approvals are documented and satisfied.

Distinguish technical readiness from authorization to launch financial services. Do not claim production approval without external evidence.

## 16. Execution Instructions

Work directly with the current repository.

Do not simply create a roadmap or rewrite documentation.

**Implement the required changes in the existing codebase.**

Proceed in this order:

1. Audit the complete application.
2. Identify critical financial and security defects.
3. Establish strict Demo/Live isolation.
4. Correct authentication, relationships, and account creation.
5. Refactor financial ledgers and transaction execution.
6. Complete genuine payment and payout integrations where authorized.
7. Integrate tuition planning and family finance workflows.
8. Update the AI Agent and administrative tools.
9. Improve the frontend and user experience.
10. Implement database migrations and automated tests.
11. Verify the production build and deployment configuration.
12. Produce the release-readiness report.

Continue through all implementable requirements without stopping after the initial audit.

Preserve existing features wherever possible.

Do not add mock implementations disguised as production functionality.

If an external provider requires credentials, business verification, licensing, or contractual approval that is unavailable, complete the safe integration structure, disable the affected Live operation, and document the precise activation requirements.

### Required Final Report

After implementation, report:

- Files reviewed and modified.
- Problems discovered and corrected.
- Demo and Live isolation results.
- Payment methods genuinely integrated.
- Transfer and payout capabilities actually available.
- Features blocked pending credentials or authorization.
- Database migrations completed.
- Security issues found and resolved.
- Automated test results.
- Remaining production-release blockers.

**Final objective: FinBridge AI must evolve from a competition-grade tuition-planning and financial simulation application into a technically robust student-and-parent finance platform, ready for authorized real-world financial operation without compromising user funds, financial integrity, or regulatory requirements.**