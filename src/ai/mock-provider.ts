import { structuredAgentResult } from "./structured-response";
import { runTool, type ToolName } from "./tools";
import type { Row } from "@/types";
export async function mockAgent(userId: string, runId: string, goal: string) {
  const text = goal.toLowerCase();
  const navigation = text.match(
    /^(?:open|go to|show me) (?:the )?(tuition(?: planner)?|budget|rent plan|settings|payments|beneficiaries|transactions|wallet|family|alerts|subscription|credit|my money)(?: page)?[.!]?$/,
  );
  if (navigation) {
    const names: Record<string, string> = {
      "tuition planner": "tuition",
      "rent plan": "budget",
      "my money": "money",
    };
    const url = names[navigation[1]] || navigation[1];
    const response = await runTool(userId, runId, "respond", {
      type: "open_page",
      message: "Opening your requested page.",
      url,
      question: null,
      options: [],
    });
    return structuredAgentResult({ respond: response }, ["respond"]);
  }

  const rent = text.match(
    /(?:rent|housing).*?(?:rmb|cny)\s*([\d,]+(?:\.\d{1,2})?).*?(\d{4}-\d{2})/,
  );
  if (rent) {
    const proposal = await runTool(userId, runId, "requestAction", {
      action: "saveBudget",
      input_json: JSON.stringify({
        category: "Housing",
        amount: rent[1].replaceAll(",", ""),
        currency: "CNY",
        month: rent[2],
      }),
    });
    return structuredAgentResult(
      { requestAction: proposal, proposedActions: [proposal] },
      ["requestAction"],
      "Your rent budget is ready for review. Confirm below to save it.",
    );
  }
  const paymentIntent =
    /withdraw|add money|top.?up|deposit|paypal|alipay|wechat|unionpay|bank transfer|wire|beneficiar|friend|parent|mother|father|child|@|উত্তোলন|充值|提现|支付宝|微信/.test(
      text,
    );
  if (paymentIntent || /balance|transactions|余额|ব্যালেন্স/.test(text)) {
    const outputs: Record<string, unknown> = {};
    const steps: ToolName[] = [];
    const call = async (name: ToolName, args: unknown = {}) => {
      steps.push(name);
      const r = await runTool(userId, runId, name, args);
      outputs[name] = r;
      return r;
    };
    const accounts = (await call("getAccounts")) as Row[];
    await call("getPaymentOptions");
    await call("getBeneficiaries");
    await call("getPaymentRequests");
    const kind = /withdraw|提现|উত্তোলন/.test(text)
      ? "WITHDRAW"
      : /add money|top.?up|deposit|充值/.test(text)
        ? "TOPUP"
        : "SEND";
    const method = /paypal/.test(text)
      ? "PAYPAL"
      : /alipay|支付宝/.test(text)
        ? "ALIPAY"
        : /wechat|微信/.test(text)
          ? "WECHAT"
          : /unionpay/.test(text)
            ? "UNIONPAY"
            : /bank|wire/.test(text)
              ? "BANK"
              : kind === "TOPUP"
                ? "CARD"
                : "INTERNAL";
    const currency = /\bbdt\b/.test(text)
      ? "BDT"
      : /\busd\b/.test(text)
        ? "USD"
        : "CNY";
    const match =
      text.match(/(?:rmb|cny|bdt|usd)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rmb|cny|bdt|usd)/i) ||
      text.match(
        /(?:send|withdraw|add money|top up|deposit)\s*([\d,]+(?:\.\d{1,2})?)/i,
      );
    const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    const candidates = accounts.filter((a) => a.currency === currency);
    const account = candidates.length === 1 ? candidates[0] : null;
    if (
      paymentIntent &&
      match &&
      account &&
      (kind === "TOPUP" || (method === "INTERNAL" && email))
    ) {
      await call("draftPayment", {
        kind,
        account_id: String(account.id),
        method,
        amount: match[1].replaceAll(",", ""),
        recipient: email || "My wallet",
        destination: email || "",
        beneficiary_id: null,
        receive_currency: currency,
        category: "Other",
        note: "Prepared from your AI request.",
      });
    }
    const drafted = outputs.draftPayment as
      { id?: string; code?: string } | undefined;
    return {
      kind: "payment",
      summary: drafted?.id
        ? "Your payment draft is saved. Review its details below and confirm to submit. Required parent and settlement approvals still apply."
        : drafted?.code
          ? `The request could not be prepared: ${drafted.code}. Review your details in the payment form below.`
          : "Your current accounts, beneficiaries and payment requests are available below. Use the payment form to supply the amount, recipient and payment method. I will never assume missing bank details.",
      summaryKey: "",
      outputs,
      steps,
      amount: "0",
    };
  }
  const kind = /send|transfer|cheapest|pay|পাঠ|সস্তা|转|汇|便宜/.test(text)
    ? "transfer"
    : /budget|spend|বাজেট|খরচ|预算|支出/.test(text)
      ? "budget"
      : /credit|ক্রেডিট|信用/.test(text)
        ? "credit"
        : /risk|ঝুঁকি|风险/.test(text)
          ? "risk"
          : "tuition";
  const tools: ToolName[] = [
    "getStudentProfile",
    "getAccounts",
    kind === "budget" ? "analyseTransactions" : "calculateTuitionGap",
    ...(kind === "transfer"
      ? (["getFxRates", "compareRemittance"] as ToolName[])
      : kind === "budget"
        ? (["generateBudgetSuggestion"] as ToolName[])
        : kind === "credit"
          ? (["getCreditGuidance"] as ToolName[])
          : []),
    "analyseFinancialHealth",
  ];
  const parsed = text.match(
    /(?:rmb|cny|cad|bdt|send|পাঠান)\s*([\d,]+(?:\.\d{1,2})?)/i,
  );
  const amount = parsed ? parsed[1].replaceAll(",", "") : "8000";
  const target = /\bcad\b/.test(text)
    ? "CAD"
    : /\bbdt\b/.test(text)
      ? "BDT"
      : "CNY";
  const source = target === "BDT" ? "CNY" : "BDT";
  const outputs: Record<string, unknown> = {};
  for (const name of tools)
    outputs[name] = await runTool(
      userId,
      runId,
      name,
      name === "compareRemittance" ? { amount, source, target } : {},
    );
  return {
    kind,
    summaryKey:
      kind === "transfer"
        ? "transferExplanation"
        : kind === "budget"
          ? "budgetExplanation"
          : kind === "credit"
            ? "creditExplanation"
            : kind === "risk"
              ? "riskExplanation"
              : "fundingExplanation",
    outputs,
    amount,
    source,
    target,
    steps: tools,
  };
}
