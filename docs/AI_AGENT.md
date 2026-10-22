# AI Agent upgrade

This change is limited to the AI Agent and its necessary provider configuration, navigation, persistence, and authorization integrations. It reuses the existing Server Actions, financial services, encrypted model table, action reviews, and design system.

## Configuration

Run `npm run db:migrate` on an existing installation. The additive agent migration preserves existing model IDs, encrypted keys, conversations and financial data. New installations include the same schema. The agent migration was applied to the local database during this work.

Use **API Keys** in the sidebar (`/[locale]/api-keys`). This renders the existing model manager; it is also still available in Settings. Admin shared models remain under `/[locale]/admin/models`. Choose a provider, enter a model ID available to that API account, save a key, test the connection, then select the model on AI Agent. Keys remain encrypted on the server. The agent never returns a decrypted key. Shared-key suffixes are also hidden from other users.

Supported protocols: Google Gemini generateContent, OpenAI Responses, Anthropic Messages, and OpenAI-compatible Chat Completions with function calling. Compatible providers must support tools. Built-in trusted endpoints are DeepSeek, Groq, OpenRouter, Mistral and xAI; additional exact HTTPS base URLs can be explicitly configured by the server operator in `AI_COMPATIBLE_BASE_URLS` (comma-separated). Redirects are rejected. No arbitrary URL supplied in chat can become a provider endpoint.

Demo mode is deterministic and explicitly labeled. Selecting it does not call a real provider. There is no silent fallback to demo after a provider error.

## Conversations and execution

All saved turns are available through paginated history. The selected thread survives refresh/navigation using an owner-scoped local identifier; content stays in MySQL. Every follow-up loads the entire ancestor chain with ownership checks, including failed turns, verified tool results and fresh confirmation/payment statuses. No six-turn truncation remains. Oversized context fails explicitly while preserving the conversation.

Provider tool loops preserve Gemini thought signatures, OpenAI response items, Claude tool-use/results and compatible tool-call IDs. JSON arguments are validated server-side. Invalid action parameters return safe field errors and the authorized schema so the model can repair a request. Final answers use a validated `respond` envelope with intent, missing information, proposed actions and operation/tool statuses.

Read tools retrieve the caller's accounts, transactions, invoices, budgets, reports, settings, cards, model metadata and activity. Arithmetic uses decimal calculations. Payments reuse existing drafts, risk checks, balances, parent approval and settlement rules. All financial mutations require the existing confirmation UI. Legacy remittance/tuition/conversion review uses its existing transfer page. Sensitive credentials, uploads, exports, account closure, user/team administration and cross-user support reports use authorized secure forms.

Student, Parent and Admin can access the agent. Tool availability and action execution both enforce roles. Admin chat does not receive global private account/chat/report data; it can read platform configuration and the minimum payment details needed for settlement. Parent payment/beneficiary approval tools retain existing linked-parent checks. Model tools never receive arbitrary user IDs or unrestricted SQL.

Action confirmations remain persisted, locked and replay-aware. An interrupted `EXECUTING` action is not automatically repeated: inspect the corresponding feature or reconcile it administratively. Expired reviews require a fresh proposal. Interrupted agent runs can be resumed after the 15-minute run guard expires. One active run per user prevents overlapping requests.

## Usage

`agent_provider_usage` records each provider HTTP attempt, including failed requests and connection tests made through the key manager. The monthly panel separates app-message quotas from provider requests. Tokens are provider-reported; missing values stay unavailable. Rate-limit headers and retry-after values are labeled timestamped snapshots, not live account quotas.

Optional input/output USD prices per million tokens produce calculated estimates. Cache discounts, cache-write premiums, taxes and non-token fees are not modeled. Historical estimates retain their recorded prices. Unknown prices remain unavailable. Account-wide billing credits/quotas require the provider dashboard; normal chat keys do not universally expose them. Timeouts may have incurred provider charges without returning usage.

## Verification

- `npm test`: unit, schema, provider wire-contract, context, usage and security tests. Transport tests simulate all four protocols, not live paid calls.
- `npm run test:payments`: existing database payment state-machine and isolation regression suite.
- `npm run test:agent`: database history, ownership, role, draft, validation-repair and usage isolation checks. Live tests are skipped unless `AGENT_LIVE_MODEL_ID` identifies an authorized configured model.
- `npm run test:agent:e2e`: starts an isolated local test server on port 3100, injects responses only for explicitly dummy test keys, and checks browser context/confirmation/reload/error flows for all providers, roles and the key-management form. It requires Playwright Chromium (`npx playwright install chromium`) and the existing local database. Temporary private model entries are removed; test users are closed and pending fixtures canceled.
- `npm run typecheck`, `npm run lint`, `npx next build`.

Live verification on 2026-10-22 used the user-provided Gemini key, stored encrypted as **Gemini (Admin)**. `gemini-3.1-flash-lite` passed connection, account tool execution, missing-month follow-up, contextual budget proposal and token metering. Tests did not commit that budget or move funds. Earlier attempts observed provider 503/busy errors; one advertised older model returned 404. Retries are bounded and do not silently change providers/models. No valid OpenAI or Anthropic credentials were available, so those integrations have transport/browser tests but no live-provider claim.

Provider contracts were checked against the [OpenAI function calling documentation](https://developers.openai.com/api/docs/guides/function-calling), [Gemini function calling documentation](https://ai.google.dev/gemini-api/docs/function-calling), and [Claude tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
