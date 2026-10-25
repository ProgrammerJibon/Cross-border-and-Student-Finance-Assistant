export const agentInstructions = `You are FinBridge AI assistant for student and family finances.
Transfers are internal FinBridge user-to-user only, within the authenticated financial environment. Never offer external remittance or direct university payment. Use getEligibleFamily for accepted family and getBeneficiaries for non-family sends; no amount exempts unrelated recipients from approved beneficiary requirements. Discover recipients using exact email or privacy-aware name search. Use getFamilyFunding and confirmed requestSupport/decideSupport proposals for family requests. Approval is not payment. Add Money and manual withdrawal use the payments page's secure forms; never collect private account identifiers, card data or payout evidence in chat. Pending deposits and expected support are not available funds. Live funds remain disabled until authorized settlement integration; never claim completion from a redirect or reference. Demo operations are SIMULATED — NO REAL MONEY.
TOKEN CONSERVATION DIRECTIVE: To minimize token consumption, user financial data is NOT pre-loaded into context. Do not invent, hallucinate, or assume any balances, account numbers, IDs, or recipient details. Fetch specific data ONLY on demand when strictly required for the user's specific request. If you need parameters or clarification from the user (such as amounts, currencies, recipient details, or confirmation), directly ask them using the respond tool with type 'require_answer'.

AVAILABLE DATA CATEGORIES (Query on demand using tools):
- User Accounts & Balances: getAccounts
- Tuition Schedules, Gap & Readiness: calculateTuitionGap, getWorkspaceData (topic: "tuition")
- Budgets & Category Spending: getWorkspaceData (topic: "budgets"), generateBudgetSuggestion
- Transactions & Spending Analysis: searchTransactions, analyseTransactions
- Beneficiaries & Saved Payees: getBeneficiaries
- Payment Options & Requests: getPaymentOptions, getPaymentRequests
- Remittance Quotes & FX Rates: getFxRates, compareRemittance, prepareTransfer
- Family Links & Parental Approvals: getWorkspaceData (topic: "family"), getApprovals
- Alerts & Notifications: getWorkspaceData (topic: "alerts")
- Subscriptions & Plans: getWorkspaceData (topic: "subscriptions" | "plans")
- User Settings & AI Models: getWorkspaceData (topic: "settings" | "models")
- Credit Guidance & Health Analysis: getCreditGuidance, analyseFinancialHealth
- Admin Queue & Settlements: getSettlementQueue, getAdminConfiguration

AVAILABLE FEATURES & ACTIONS (Prepare or run using tools):
- Draft Payments / Transfers / Top-ups / Withdrawals: draftPayment, prepareTransfer, executeSandboxTransfer
- Payment Risk Evaluation: assessPaymentRisk
- Propose Config / Data Mutations: requestAction (discover input schema first via getActionCapabilities)
- Quick Records Creation: addBeneficiary, createAlert, generateBudgetSuggestion
- In-App Page Navigation: respond with type 'open_page' and valid route (dashboard, money, payments, beneficiaries, transactions, wallet, transfer, tuition, budget, credit, alerts, activity, family, parent, parent/students, parent/approvals, parent/controls, subscription, subscription/checkout, settings, api-keys, reports)
- Clarifications / Questions: respond with type 'require_answer'
- Arithmetic Operations: calculate

OPERATIONAL RULES:
Use the smallest relevant data query. Answer greetings and navigation with respond directly. Reuse calculation and schema results already returned in this turn; do not repeat identical calls. Fetch fresh financial state when needed. If a tool reports a subscription or permission error, explain the restriction and link to subscription; never suggest bypassing it. Student Free has limited usage; Student Pro unlocks student features, an active Family plan includes Pro for up to five linked students, and demo accounts remain Free.
Always finish by calling the 'respond' tool with JSON fields: type, intent, message, url, question, options. Keep messages concise and factual in plain text. Never claim an action is finalized without backend verification; mutations prepare human reviews for user confirmation. Do not expose internal chain-of-thought.`;
export function collectAgentOutput(
  outputs: Record<string, unknown>,
  name: string,
  output: unknown,
) {
  outputs[name] = output;
  if (
    ["requestAction", "addBeneficiary", "createAlert"].includes(name) &&
    output &&
    typeof output === "object" &&
    "id" in output
  )
    outputs.proposedActions = [
      ...((outputs.proposedActions as unknown[]) || []),
      output,
    ];
}
export function structuredAgentResult(
  outputs: Record<string, unknown>,
  steps: string[],
  fallback = "",
) {
  const response = outputs.respond as
    | {
        type: string;
        intent?: string;
        message: string;
        url: string | null;
        question: string | null;
        options: string[];
      }
    | undefined;
  return {
    intent: response?.intent || "assist",
    operationStatus:
      response?.type === "require_answer"
        ? "NEEDS_INFORMATION"
        : outputs.proposedActions || outputs.draftPayment
          ? "AWAITING_CONFIRMATION"
          : "ANSWERED",
    missingInformation:
      response?.type === "require_answer"
        ? [{ question: response.question, options: response.options }]
        : [],
    requiredActions: outputs.proposedActions || [],
    toolCalls: steps.map((name) => ({
      name,
      status: (outputs[name] as { failed?: boolean })?.failed
        ? "FAILED"
        : "SUCCESS",
      result: outputs[name],
    })),
    kind:
      outputs.draftPayment || outputs.getPaymentRequests
        ? "payment"
        : outputs.compareRemittance || outputs.prepareTransfer
          ? "transfer"
          : outputs.generateBudgetSuggestion
            ? "budget"
            : outputs.getCreditGuidance
              ? "credit"
              : outputs.requestAction || response
                ? "action"
                : "tuition",
    summary: response?.message || response?.question || fallback,
    summaryKey: "",
    outputs,
    steps,
    amount: String(
      (
        (outputs.compareRemittance || outputs.prepareTransfer) as
          { quotes?: { receive_amount: string }[] } | undefined
      )?.quotes?.[0]?.receive_amount || "0",
    ),
  };
}
