# FinBridge AI

A student and cross-border finance competition application built with Next.js, Server Actions and a MySQL-compatible database. Students can plan tuition, compare simulated remittance providers, involve a parent, approve a sandbox transfer and inspect its receipt and audit evidence.

All balances, exchange rates, providers and payments are **sandbox data**. No real money moves. This repository has a working local demo; the remaining specification items are tracked in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Technology and architecture

- Next.js 16.4 App Router, React 19, TypeScript, Tailwind CSS 4.
- Material UI and Community MUI X Charts; React Icons.
- MySQL-compatible SQL through `mysql2/promise`, a connection pool and parameterized queries.
- Zod validation; Decimal.js calculations; bcrypt password hashes; signed JWT sessions with `jose`.
- Deterministic mock agent by default. OpenAI Responses and Google Gemini adapters with application-owned tools and encrypted, user-selectable model configurations.
- Playwright browser tests and Node unit tests.

Normal application requests use dedicated `"use server"` action modules. There are no REST endpoints, API route handlers, separate Express server, Supabase or Firebase dependencies. Actions authenticate the caller, validate inputs, check roles and ownership, and invoke services. The browser never receives database credentials or an OpenAI key.

```text
src/app/                   Locale layouts, dynamic route resolver, shared CSS
src/actions/               Authenticated application Server Actions
src/services/              FX, tuition, remittance, parent controls, sandbox execution
src/ai/                    Mock/OpenAI/Gemini providers and validated financial tools
src/components/            Student, parent, admin, public pages and shared UI
src/dictionaries/          English, Simplified Chinese, Bangla
src/lib/                   SQL, sessions, permissions, validation, risk and money
database/                  Schema, reference seed and demo seed
scripts/                   Setup, additive migrations and seed generation
tests/                     Financial unit tests and browser workflows
```

Read `AGENTS.md` before changing Next.js code. The installed framework's guides are in `node_modules/next/dist/docs/`; this version differs from older releases.

## Installation and MySQL setup

Use Node.js 22 or newer and npm. MySQL 8 is the intended database target. The local implementation has been exercised against the user's existing XAMPP **MariaDB 10.4.32**, not a separate MySQL 8 installation. Both support the SQL window functions used by rate history.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Create a dedicated database and database account on your existing server using your database administration tool:

```sql
CREATE DATABASE finbridge_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'finbridge'@'localhost' IDENTIFIED BY 'choose-a-local-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON finbridge_ai.* TO 'finbridge'@'localhost';
```

Put those connection details in `.env.local`. Generate `SESSION_SECRET` using `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and keep it local. The existing workspace is already configured; do not overwrite its `.env.local` to continue development.

```powershell
npm run db:setup
npm run dev
```

Open [the local demo](http://127.0.0.1:3000/en/demo). The development server binds to loopback.

`db:setup` imports `schema.sql` and `seed.sql`, then applies additive migrations. Seed inserts use `INSERT IGNORE`; rerunning setup does not reset existing demo balances, dates or subscriptions. Use a separate database for a fresh scenario. `scripts/generate-demo.mjs` regenerates the seed SQL file, not live database records.

For an existing populated project, apply only new migrations:

```powershell
npm run db:migrate
```

The additive migrations add the country/currency catalog, profile photos, moderator permissions, encrypted AI models, saved demo cards, beneficiaries, payment requests, settlement history and subscription events. Demo mode adds clearly labeled team illustrations and an RMB family wallet without replacing later Admin edits. FX timestamps retain microsecond precision. In demo mode it inserts 29 days of illustrative historical rates without replacing current rates. No unrelated databases are changed.

`scripts/provision-local.mjs` is an optional local XAMPP bootstrap that requires database administrator access and creates this project's database/account and environment file. Normal application execution uses the limited project account; do not use the bootstrap against a shared production server.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Existing database server; default port 3306 |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Dedicated project database and credentials |
| `SESSION_SECRET` | Random signing secret, at least 32 characters |
| `NEXT_PUBLIC_APP_NAME` | Display branding; defaults to FinBridge AI |
| `APP_URL` | Intended public origin for deployment configuration |
| `AI_MODE` | Legacy adapter default; the UI uses each user’s selected model |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Legacy server adapter configuration; new model configurations are managed in Settings/Admin |
| `AI_KEY_ENCRYPTION_SECRET` | Optional stable 32+ character encryption secret; falls back to `SESSION_SECRET`. Re-enter saved keys after rotating this secret |
| `DEMO_MODE` | Enables demo-role login and demo password reset when `true` |

Never commit `.env.local`. Demo-role login includes an administrator session: disable `DEMO_MODE`, remove or suspend seeded demo users, change the seeded administrator credentials, and configure HTTPS before exposing a non-demo deployment.

## Demo accounts

All three seeded accounts use password **`DemoOnly!2026`**. These are public demonstration credentials, not production credentials.

| Role | Email | Starting plan |
| --- | --- | --- |
| Student | `student@finbridge.demo` | Pro |
| Parent | `parent@finbridge.demo` | Family |
| Administrator | `admin@finbridge.demo` | Pro |

The student and parent are already linked. New students/parents can register, but public registration cannot create an administrator. The first administrator comes from the demo seed. The demo page provides role buttons when demo mode is enabled.

The student starts with BDT 780,000, RMB 16,880.40 and USD 420, an RMB 41,680 tuition invoice due 34 days after seeding, and an RMB 5,210 scholarship. Monthly income and living-cost assumptions produce a projected tuition gap even though current cash can cover the transfer. Current cash and projected funds after living expenses intentionally differ.

## Pages and workflows

Prefix every route with `/en`, `/zh-CN` or `/bn-BD`.

| Area | Routes and capabilities |
| --- | --- |
| Public | `/`, `/features`, `/how-it-works`, `/pricing`, `/security`, `/about`, `/terms`, `/privacy`, `/demo` |
| Access | `/login`, `/register`, `/forgot-password`, `/onboarding` |
| Student finances | `/dashboard`, `/money`, `/transactions`, `/budget`, `/wallet`, `/transfer` |
| Planning | `/tuition`, `/credit`, `/agent`, `/alerts`, `/activity` |
| Shared account tools | `/subscription`, `/subscription/checkout`, `/settings`, `/reports`, `/security-assessment` |
| Family | Student `/family`; parent `/parent`, `/parent/students`, `/parent/approvals`, `/parent/controls` |
| Administration | `/admin`, `/admin/users`, `/admin/plans`, `/admin/subscriptions`, `/admin/reports`, `/admin/risk`, `/admin/agent`, `/admin/finance`, `/admin/audit`, `/project-evidence` |

Students can add/edit/archive empty accounts; add and categorize transactions; filter/search/page through transactions; import CSV; create monthly budgets; maintain tuition invoices; save funding scenarios; compare providers; simulate transfers/conversions; update credit-readiness tasks; manage alerts and submit reports.

CSV imports accept up to 5 MB and 2,000 rows, with column mapping and a preview. Required columns are `description,amount,type,category,date`; `notes` is optional. Types are `INCOME` or `EXPENSE`, dates are ISO `YYYY-MM-DD`, amounts are positive decimal strings, and categories must match the application's category list. The selected account determines currency. Validation and balance checks run on the server; failed imports roll back the complete batch.

Parents initiate invitations to registered students; the student accepts the token. Parents manage sharing and payment controls for the linked family. Parents do not receive the student's private AI conversation. Parent controls include transfer thresholds, per-transfer/daily/monthly limits, tuition/conversion approval switches and monthly category caps displayed in RMB. An internal CAD normalization base is retained for compatibility with the existing ledger and risk engine. Blank category caps are unlimited; zero blocks spending. The strictest applicable linked-parent cap applies. Controls are enforced for manual expenses, imports, recategorization and outgoing transfers.

Administrators can manage users, plan prices/limits, reports, provider costs/status, FX rates, countries, currencies, shared AI models, team profiles, moderator permissions, payment methods and the settlement queue. Moderators receive only the selected sections; only administrators can grant permissions. Moderators can edit their own photo, email and portfolio link. See the status document for financial configuration editors still outstanding.

## Sandbox financial engine

1. Compare provider quotes from database rates, spreads, fixed fees and percentage fees. Provider fixed fees are stored in BDT and converted to the source currency; transfer limits are in CAD equivalent.
2. Save quotes server-side with a 30-minute expiry. Client-supplied amounts cannot alter an existing quote.
3. Prepare a transfer. Check account ownership/status, exact source balance, provider limits, duplicate/frequency limits, daily/monthly ceilings, tuition deadline and parent controls. An invoice and wallet destination cannot both receive the same transfer.
4. Collect required parent decisions. A parent approval does not execute a transfer.
5. The student explicitly selects **Approve & simulate transfer**. The server creates a random one-use token, stores only its SHA-256 hash, and expires it after five minutes.
6. Execute in a database transaction while locking the student and affected financial records. Recheck risk and quota; debit the source; credit the destination or tuition invoice; write balanced per-currency ledger entries and transaction records; consume the token; increment usage; verify the resulting balance; preserve the audit event and receipt.

Failure rolls back execution. Completed transfers cannot be replayed. Parent settings may tighten the platform ceilings but cannot relax them. Admin → Financial data now edits the daily/monthly ceilings, frequency limit and large-transfer threshold in RMB. Default internal ceilings are CAD 15,000/day, CAD 50,000/month and ten transfers/day; both payment workflows read the same policy. The interface freezes prepared transfer details so approval corresponds to the stored draft.

Money is calculated with Decimal.js and stored in SQL `DECIMAL` columns. FX rates are units of each currency per CAD. Amounts remain decimal strings across server boundaries. Charts convert to numeric display values only.

## AI modes and evidence

`AI_MODE=mock` runs deterministic, database-backed tools without a key or external request. It supports tuition, transfer, budget, credit and risk prompts. Tool calls and outputs, agent runs and results are stored for inspection/export.

Add a model in **Settings → My AI models** (student or parent), or **Admin → AI models** for shared models. Choose OpenAI or Google Gemini, enter the provider's model ID and API key, then select that model in Settings or the agent header. Keys use authenticated AES-256-GCM encryption and never return to the browser; only the last four characters are displayed. Provider errors distinguish invalid keys, unavailable models, quota exhaustion and temporary overload without returning provider secrets. Use **Test connection** beside a saved model. On 2026-10-14, the saved Gemini key passed live connection and financial-tool tests with `gemini-3.8-flash`; the previous `gemini-1.5-pro` returned 404. Later Google calls intermittently returned 503 high-demand errors, which the app retries once. The final live check reached Google's reported 20-request free-tier limit for that model; no further live requests were sent. Live OpenAI access remains unverified.

The agent can inspect accounts, transactions, beneficiaries and payment statuses, create beneficiary approval requests, prepare persistent payment drafts, and generate budget suggestions for explicit review/save. Try **“Add money RMB 100 by card”**, **“Send RMB 100 to friend@example.com”**, **“Withdraw RMB 200 using Alipay”**, or **“Check my balance and transactions”**. Missing or ambiguous account/destination information opens the normal payment form. It never invents recipient bank details or asks for card data in chat. A visible confirmation submits its saved draft through the exact service used by the normal UI. Previous completed conversations can be reopened.

Tool outcomes, runs, state transitions and receipts are persisted. No model can execute SQL, approve a parent decision, settle an external payment or mint the legacy transfer approval token. Parent permissions and limits are rechecked by application code.

## Payments, beneficiaries and manual settlement

Students and parents have `/payments`, `/beneficiaries`, `/money`, `/transactions` and `/agent`. Both can send to registered wallets; the recipient needs an active wallet in the selected currency. RMB/BDT are the primary demo currencies; the catalog and per-method currency lists support international expansion.

Supported methods are FinBridge wallet, demo card (deposits only), bank/wire, PayPal, Alipay, WeChat Pay and UnionPay. External methods are **manual sandbox workflows**, not live provider integrations. Admin configures receiving accounts/instructions and supported currencies at `/admin/payment-methods`. Authorized settlement moderators use `/admin/settlements`.

- New requests are saved as `DRAFT`; reviewing a draft does not debit or credit money. Draft exchange rates expire after 30 minutes.
- Explicit confirmation reserves outgoing funds. Parent rules can move the request to `WAITING_PARENT`. Approved wallet transfers settle atomically; external requests enter `QUEUED`.
- Reviewers move a queued request to `PROCESSING`, then record `COMPLETED` with a settlement reference or `FAILED`. Queued requests may be rejected. Manual deposits are credited only on completion; failed/rejected/cancelled outgoing requests release the reservation once.
- Users can cancel drafts, queued requests and requests awaiting a parent. Processing requests are controlled by the settlement reviewer to avoid refunding a payout already being handled.
- Card deposits use only the existing demo card numbers, require a cardholder/expiry/CVV or a user-owned saved demo token, and credit once on success. No PAN or CVV is persisted. Saved cards can be renamed/removed in Settings.
- Student beneficiaries require linked-parent decisions. A destination change requires a new record and new approval. One-time recipients can use parent-configured auto-approval and amount limits; otherwise a parent must decide. Unlinked students use the administrator's one-time-recipient ceiling (default RMB 1,000).
- Every transition records an event and audit entry. Payment status/history appears in Payments and Transactions and refreshes every ten seconds while the page is visible. Notifications respect the account preference.

Database locks, owner checks, request idempotency keys, exact decimal checks, reservations, per-currency ledger pairs and terminal-state guards prevent duplicate credits/refunds. Both payment systems share category limits, daily/monthly risk totals and transfer quotas.

## Plans and usage limits

Plans/prices/limits are database records editable by an administrator. New registrations receive the configured trial (seven days in the seed).

| Seeded plan | Monthly BDT | Accounts | Agent messages | Transfers | Tuition plans | CSV imports | Parent links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Trial | 0 | 1 | 30 | 3 | 1 | 1 | 1 |
| Student | 299 | 5 | 500 | 30 | 5 | 10 | 2 |
| Pro | 699 | 20 | 2,000 | 100 | 20 | 50 | 5 |
| Family | 999 | 20 | 2,000 | 100 | 20 | 50 | 10 |

Usage counters use UTC calendar months and user-row locks. Account/link limits use current active records. Expired or cancelled subscriptions cannot authorize quota-gated operations. Upgrades preserve current-month consumption.

Checkout accepts only test cards: `4242424242424242` succeeds; `4000000000000002` records a failure. Use the **Use demo card** button. The server retrieves the price from the database; only the last four digits are stored, never the full card number or CVV. Checkout supports monthly or annual billing using server-side prices and records subscription changes. Each purchase starts the selected period immediately.

## Security, preferences and accessibility

- bcrypt password hashing; httpOnly SameSite=Lax sessions, Secure in production, eight-hour expiry and database session-version revocation.
- Server-side role/ownership checks on every privileged action, bound SQL parameters, Zod validation, database transactions and a login throttle.
- Server Action origin protection supplied by Next.js; frame denial and MIME/referrer/permissions response headers.
- Sensitive keys remain server-side. User exports exclude password hashes/session secrets. Account closure revokes sessions.
- English, Simplified Chinese and Bangla dictionaries; language/theme preferences saved in MySQL; theme is mirrored in localStorage and cookies. First visits use the device theme, signup preserves it, and stored account preferences win after login. Sidebar collapse state is stored locally and sidebar scrolling survives page loading.
- Semantic controls, labels, keyboard focus, MUI dialogs, responsive tables, mobile navigation and chart text alternatives. Automated viewport checks are not a substitute for a full accessibility audit.
- Notification preference suppresses newly generated in-app notifications. The bell displays the unread count and marks notifications read when opened. Existing notification history remains available.

## Development, production and tests

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:payments
npm run build
npm start
```

Run browser tests against a running dev server and a disposable seeded database:

```powershell
npx playwright install chromium
npx playwright test
```

To test a separately running production server on port 3001, set `$env:TEST_URL = 'http://127.0.0.1:3001'` before the Playwright command.

The Playwright suite covers student/parent/admin navigation, seven viewport widths (360, 390, 768, 1024, 1366, 1440, 1920), locale/theme persistence, registration/onboarding, transaction entry, demo checkout, the agent-to-transfer workflow, parent approval, ledger conservation, receipt creation, replay/cross-role rejection and parent category-limit rollback. Test-created users are closed after successful runs; their audit evidence is retained. Failed runs may leave fixture users in the test database.

Unit tests exercise decimal arithmetic, tuition forecasting, fees/spreads, risk hard stops, role routing, subscription expiry, quota boundaries and category limits. Screenshots are written under `.local/screenshots`; failure traces under `test-results`. These directories are ignored.

`npm audit --omit=dev` reported no production advisories at the time of implementation. The full audit had five development-tool advisories through the ESLint/fast-glob dependency chain; do not apply an automatic forced downgrade of Next.js to resolve those.

## One-minute competition demonstration

1. Open `/en/demo` and select Student. Show tuition readiness, the funding gap and multi-currency accounts.
2. Open AI agent and select **Send RMB 800.** Show database tool outputs and provider comparison.
3. Select **Review transfer**, choose **Living expenses**, compare providers and run risk checks.
4. Open the Parent demo in a separate browser profile; approve the request with a reason.
5. Return to Student and select **Approve & simulate transfer**. Show the receipt, changed balance and exported evidence.
6. Open the Administrator demo to inspect risk, agent-tool calls and audit events.

For the tuition scenario, start from the tuition invoice's payment action so the completed simulation credits that invoice. Resetting a scenario is intentionally not part of normal setup, because reimporting seeds must not destroy existing work.

## Known limitations and next work

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the specification gap list. This is a competition sandbox, not a production banking integration or an independently security-audited financial product. Password-reset tokens are exposed only for seeded demo users; ordinary-user email recovery is not integrated. FX data is illustrative, credit readiness is educational, and provider names are fictional. No real bank/payment connection or external email/SMS service is required for this demo.

## Latest verification and demo team

The additional payment integration suite creates isolated fixture users and checks all external deposit methods, withdrawal settlement/refunds, linked-parent and one-time-recipient rules, an AI-created card draft, concurrent confirmation, replay rejection, ownership and per-currency ledger balance. Fixture users are closed afterward; audit records remain. Browser tests also cover system/database theme precedence, photo/country signup, sidebar/search, saved keys/cards, moderator access, catalog management, AI card top-up, manual settlement and beneficiary approval. See IMPLEMENTATION_STATUS.md for the latest run results.

About Us includes **four fictional demo team profiles**, visibly marked Demo, with illustrated avatars, reserved example.com contacts and example portfolio links. Edit them under Admin → Team. Public demo moderator accounts include `amina@example.com`, `li@example.com`, `sadia@example.com`, and `chen@example.com`, password `DemoOnly!2026`. Their sections differ; the administrator manages permission assignments. These accounts are demo-only.


## Structured agent actions

The agent uses validated JSON function calls rather than attempting to infer actions from prose. Its `respond` envelope supports `open_page`, `require_answer` and `message`; payments use `draftPayment`, and other changes use `requestAction`. Navigation is restricted to known routes allowed for the signed-in role. Follow-up answers retain the previous conversation context, and live tool progress is read from persisted tool logs.

Examples: **“Open tuition planner”**, **“Plan rent RMB 2200 for 2026-11”**, **“Create a tuition invoice”**, **“Record my grocery expense”**, and **“Send money to Mike”**. Incomplete or ambiguous instructions require answers rather than guessed financial details. The action catalog exposes account management, category budgets, tuition invoices/funding plans, expenses/categorization, reminders, credit inputs, preferences, family invitations/controls, beneficiaries, payment cancellation, parent decisions, subscription cancellation, saved-card management, model selection and support reports. Account/card/password/API-key/photo/CSV/checkout flows that require secure input open their normal forms. Administrative authority is never granted to a student or parent agent.

An action proposal stores its validated input and owner. **Confirm action** calls the same authenticated Server Action as its normal form, rechecking ownership and permissions. Proposals expire after 30 minutes. A conditional state transition prevents concurrent confirmations from executing twice. Completed results reopen without executing again. An interrupted `EXECUTING` record requires reconciliation before retry, rather than automatically replaying an uncertain mutation. Payment drafts retain their separate atomic financial state machine and all parent/manual-settlement checks.

Cash records cannot fund payment requests or legacy transfer simulations and cannot be converted into payment-wallet account types. Manual wallet deposits go through Payments; card inputs stay out of chat and stored tool data.

## Alerts and configuration

Workspace loading evaluates and deduplicates low-balance, upcoming/overdue tuition, funding-gap, category overspending, large-expense, quota, FX movement and subscription-expiry alerts. Read/dismiss/snooze state survives repeated evaluations; resolved conditions close and a recurrence reopens the alert. Parent alerts include only conditions permitted by current linked-family visibility. Notifications respect the notification preference. There is no background delivery service while the app is closed.

Admin → Financial data also manages supported provider currency routes and country-specific educational credit checklists. Editing an existing provider preserves deliberately removed routes. Budget chart series use the user's display currency before comparison.

Public pages now have distinct sections: Home has the financial-planning preview; Features has the capability overview; How It Works has the interactive journey and payment status paths; Security explains access controls and data boundaries. Parent overview, student details, controls and approvals are separate views. Transactions separates posted entries from request status history with tabs.
