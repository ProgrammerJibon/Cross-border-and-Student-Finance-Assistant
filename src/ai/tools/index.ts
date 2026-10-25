import {
  responseSchema,
  actionProposalSchema,
  agentActionCatalog,
} from "../action-catalog";
import {
  agentCapabilities,
  validateAgentResponse,
  proposeAgentAction,
  agentWorkspaceData,
} from "../action-service";
import { getCreditGuidance } from "@/services/financial-config.service";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, write } from "@/lib/db";
import { getRates } from "@/services/currency.service";
import { tuitionGap } from "@/services/tuition.service";
import { compareQuotes } from "@/services/remittance.service";
import { requireCondition, AppError } from "@/lib/errors";
import { currency } from "@/lib/validation";
import { D, money } from "@/lib/money";
import { requestSchema, beneficiarySchema } from "@/lib/payment-rules";
import {
  createPaymentDraft,
  paymentWorkspace,
  paymentActor,
  previewPaymentRisk,
} from "@/services/payment.service";
import { canUseAgentTool } from "../tool-policy";
import type { Role } from "@/types";
import { getRiskPolicy } from "@/services/financial-config.service";
import { eligibleRecipients, discoverRecipients } from "@/services/recipient.service";
const empty = z.object({}).strict();
const comparison = z
  .object({
    amount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/)
      .refine((v) => Number(v) > 0),
    source: currency,
    target: currency,
  })
  .strict();
export const toolSchemas = {
  getEligibleFamily:empty,
  discoverRecipients:z.object({query:z.string().min(3).max(190)}).strict(),
  getFamilyFunding:empty,
  calculate: z
    .object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      left: z.string().regex(/^-?\d{1,15}(\.\d{1,8})?$/),
      right: z.string().regex(/^-?\d{1,15}(\.\d{1,8})?$/),
    })
    .strict(),
  getActivity: empty,
  getApprovals: empty,
  getTransfers: empty,
  getSettlementQueue: empty,
  getAdminConfiguration: z
    .object({
      topic: z.enum(["finance", "catalog", "plans", "paymentMethods"]),
    })
    .strict(),
  searchTransactions: z
    .object({
      search: z.string().max(160),
      page: z.number().int().min(0).max(10000),
    })
    .strict(),
  getActionCapabilities: empty,
  getWorkspaceData: z
    .object({
      topic: z.enum([
        "tuition",
        "budgets",
        "transactions",
        "alerts",
        "family",
        "subscriptions",
        "settings",
        "reports",
        "savedCards",
        "models",
        "plans",
      ]),
    })
    .strict(),
  requestAction: actionProposalSchema,
  respond: responseSchema,
  assessPaymentRisk: z
    .object({ request_id: z.string().min(1).max(64) })
    .strict(),
  getPaymentOptions: empty,
  getPaymentRequests: empty,
  getBeneficiaries: empty,
  addBeneficiary: beneficiarySchema,
  draftPayment: requestSchema,
  getStudentProfile: empty,
  getAccounts: empty,
  analyseTransactions: empty,
  calculateTuitionGap: empty,
  compareRemittance: comparison,
  getFxRates: empty,
  generateBudgetSuggestion: empty,
  analyseFinancialHealth: empty,
  getCreditGuidance: empty,
  createAlert: z.object({ detail: z.string().min(1).max(500) }).strict(),
  prepareTransfer: comparison,
  executeSandboxTransfer: z.object({ transferId: z.string().max(64) }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export async function runTool(
  userId: string,
  runId: string,
  name: ToolName,
  input: unknown,
) {
  const actor = await paymentActor(userId);
  requireCondition(canUseAgentTool(actor.role as Role, name), "FORBIDDEN");
  requireCondition(
    (
      await rows(
        "SELECT id FROM agent_runs WHERE id=? AND user_id=? AND status='RUNNING'",
        [runId, userId],
      )
    ).length,
    "NOT_FOUND",
  );
  const parsed = toolSchemas[name].safeParse(input);
  if (!parsed.success) {
    const output = {
      failed: true,
      code: "VALIDATION_ERROR",
      fields: parsed.error.issues.map((i) => i.path.join(".")),
      instruction:
        "Ask the user for missing information or correct these fields. No action was executed.",
    };
    await write(
      "INSERT INTO agent_tool_calls(id,run_id,name,input,output,status) VALUES (?,?,?,?,?,'FAILED')",
      [randomUUID(), runId, name, "{}", JSON.stringify(output)],
    );
    return output;
  }
  const args = parsed.data;
  let output: unknown;
  try {
    switch (name) {
      case "calculate": {
        const v = toolSchemas.calculate.parse(args);
        requireCondition(
          v.operation !== "divide" || !D(v.right).isZero(),
          "VALIDATION_ERROR",
        );
        output = {
          ...v,
          result: (v.operation === "add"
            ? D(v.left).plus(v.right)
            : v.operation === "subtract"
              ? D(v.left).minus(v.right)
              : v.operation === "multiply"
                ? D(v.left).mul(v.right)
                : D(v.left).div(v.right)
          ).toString(),
        };
        break;
      }
      case "searchTransactions": {
        const v = toolSchemas.searchTransactions.parse(args);
        const data = await rows(
          "SELECT id,account_id,description,amount,currency,category,type,date FROM finance_records WHERE user_id=? AND description LIKE ? ORDER BY date DESC,id DESC LIMIT 51 OFFSET " +
            v.page * 50,
          [userId, `%${v.search}%`],
        );
        output = {
          rows: data.slice(0, 50),
          hasMore: data.length > 50,
          page: v.page,
        };
        break;
      }
      case "getEligibleFamily": output=await eligibleRecipients(userId);break;
      case "discoverRecipients": output=await discoverRecipients(userId,toolSchemas.discoverRecipients.parse(args).query);break;
      case "getFamilyFunding": output=await rows("SELECT id,student_id,parent_id,amount,currency,reason,status,payment_id,expires_at FROM family_funding_requests WHERE student_id=? OR parent_id=? ORDER BY created_at DESC LIMIT 50",[userId,userId]);break;
      case "getActivity":
        output = await rows(
          "SELECT action,entity_type,entity_id,created_at FROM audit_logs WHERE actor_id=? ORDER BY created_at DESC LIMIT 100",
          [userId],
        );
        break;
      case "getTransfers":
        output = await rows(
          "SELECT t.id,t.recipient,t.purpose,t.status,q.total,q.source_currency,q.receive_amount,q.target_currency FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT 100",
          [userId],
        );
        break;
      case "getApprovals":
        output = await rows(
          "SELECT p.id,p.status,t.recipient,t.purpose,q.total,q.source_currency,q.receive_amount,q.target_currency FROM parent_approvals p JOIN sandbox_transfers t ON t.id=p.transfer_id JOIN transfer_quotes q ON q.id=t.quote_id WHERE p.parent_id=? AND EXISTS (SELECT 1 FROM family_links f WHERE f.parent_id=p.parent_id AND f.student_id=t.user_id AND f.status='LINKED') ORDER BY p.created_at DESC LIMIT 100",
          [userId],
        );
        break;
      case "getSettlementQueue":
        output = (await paymentWorkspace(userId)).requests
          .filter((r) => ["QUEUED", "PROCESSING"].includes(String(r.status)))
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            method: r.method,
            amount: r.amount,
            currency: r.currency,
            recipient: r.recipient,
            destination: r.destination,
            receive_amount: r.receive_amount,
            receive_currency: r.receive_currency,
            status: r.status,
            reference: r.reference,
          }));
        break;
      case "getAdminConfiguration": {
        const topic = toolSchemas.getAdminConfiguration.parse(args).topic;
        if (topic === "finance")
          output = {
            risk: await getRiskPolicy(),
            riskCurrency: "CAD",
            providers: await rows("SELECT * FROM remittance_providers"),
            corridors: await rows("SELECT * FROM remittance_corridors"),
            rates: await getRates(),
          };
        if (topic === "catalog")
          output = {
            countries: await rows("SELECT * FROM countries"),
            currencies: await rows("SELECT * FROM currencies"),
          };
        if (topic === "plans")
          output = await rows(
            "SELECT p.*,r.monthly,r.yearly,r.currency FROM plans p JOIN plan_prices r ON r.plan_id=p.id",
          );
        if (topic === "paymentMethods")
          output = {
            methods: (await paymentWorkspace(userId)).methods,
            policy: (await paymentWorkspace(userId)).policy,
          };
        break;
      }
      case "assessPaymentRisk":
        output = await previewPaymentRisk(
          userId,
          (args as { request_id: string }).request_id,
        );
        break;
      case "getActionCapabilities":
        output = await agentCapabilities(userId);
        break;
      case "getWorkspaceData":
        output = await agentWorkspaceData(
          userId,
          (args as { topic: string }).topic,
        );
        break;
      case "requestAction":
        output = await proposeAgentAction(userId, runId, args);
        break;
      case "respond":
        output = await validateAgentResponse(userId, args);
        break;
      case "getPaymentOptions": {
        const ws = await paymentWorkspace(userId);
        output = {
          methods: ws.methods,
          financialEnvironment: actor.is_demo ? "DEMO" : "LIVE",
          liveMoneyMovementAvailable: false,
          confirmationRequired: true,
          instruction:
            "Only internal sends to approved beneficiaries or accepted family are supported. Use getEligibleFamily and getBeneficiaries. For Add Money (Stripe/PayPal gateway or manual deposit) and external manual withdrawal, open payments and collect destination details only in its secure form. Live money is disabled. Pending deposits are not available funds. Never request credentials or payout identifiers in chat.",
        };
        break;
      }
      case "getPaymentRequests":
        output = (await paymentWorkspace(userId)).requests.map((r) => ({
          id: r.id,
          kind: r.kind,
          method: r.method,
          amount: r.amount,
          currency: r.currency,
          recipient: r.recipient,
          receive_amount: r.receive_amount,
          receive_currency: r.receive_currency,
          status: r.status,
          owned: r.user_id === userId,
          ...(r.user_id === userId
            ? { account_id: r.account_id, destination: r.destination }
            : {}),
        }));
        break;
      case "getBeneficiaries":
        output = (await paymentWorkspace(userId)).beneficiaries.map((b) => ({
          id: b.id,
          name: b.name,
          method: b.method,
          currency: b.currency,
          destination: b.destination,
          status: b.status,
          owned: b.user_id === userId,
        }));
        break;
      case "addBeneficiary":
        output = await proposeAgentAction(userId, runId, {
          action: "addBeneficiary",
          input_json: JSON.stringify(args),
        });
        break;
      case "draftPayment":
        {
          const draft = await createPaymentDraft(
            userId,
            args,
            `agent-${runId}`,
          );
          output = {
            id: draft.id,
            kind: draft.kind,
            method: draft.method,
            amount: draft.amount,
            currency: draft.currency,
            recipient: draft.recipient,
            destination: draft.destination,
            receive_amount: draft.receive_amount,
            receive_currency: draft.receive_currency,
            status: draft.status,
            confirmationRequired: true,
          };
        }
        break;
      case "getStudentProfile":
        output =
          (
            await rows(
              "SELECT university,home_country,study_country,home_currency,study_currency,monthly_income,monthly_expenses,goals FROM student_profiles WHERE user_id=?",
              [userId],
            )
          )[0] || {};
        break;
      case "getAccounts":
        output = await rows(
          "SELECT id,name,currency,balance,type FROM accounts WHERE user_id=? AND archived=0",
          [userId],
        );
        break;
      case "analyseTransactions":
        output = await rows(
          "SELECT category,currency,type,SUM(amount) total,COUNT(*) count FROM finance_records WHERE user_id=? AND date>=DATE_SUB(UTC_DATE(),INTERVAL 30 DAY) GROUP BY category,currency,type",
          [userId],
        );
        break;
      case "calculateTuitionGap":
        output = await tuitionGap(userId);
        break;
      case "getFxRates":
        {
          const rates = await getRates();
          output = {
            base: "CNY",
            sandbox: true,
            rates: Object.fromEntries(
              Object.entries(rates).map(([code, rate]) => [
                code,
                D(rate).div(rates.CNY).toFixed(8),
              ]),
            ),
          };
        }
        break;
      case "compareRemittance":
      case "prepareTransfer": {
        requireCondition(actor.is_demo, "LIVE_RAIL_UNAVAILABLE");
        const v = comparison.parse(args);
        output = {
          quotes: await compareQuotes(v.amount, v.source, v.target),
          sandbox: true,
          approvalRequired: true,
        };
        break;
      }
      case "generateBudgetSuggestion": {
        const p = (
          await rows<{ monthly_income: string; study_currency: string }>(
            "SELECT monthly_income,study_currency FROM student_profiles WHERE user_id=?",
            [userId],
          )
        )[0];
        output = {
          currency: p?.study_currency || "CNY",
          suggested: true,
          saved: false,
          categories: [
            {
              category: "Housing",
              amount: money(D(p?.monthly_income || 0).mul(0.45)),
            },
            {
              category: "Food",
              amount: money(D(p?.monthly_income || 0).mul(0.18)),
            },
            {
              category: "Transport",
              amount: money(D(p?.monthly_income || 0).mul(0.08)),
            },
            {
              category: "Other",
              amount: money(D(p?.monthly_income || 0).mul(0.09)),
            },
          ],
          savings: money(D(p?.monthly_income || 0).mul(0.2)),
        };
        break;
      }
      case "analyseFinancialHealth": {
        const gap = await tuitionGap(userId);
        output = {
          readiness: gap?.readiness ?? 100,
          fundingGap: gap?.shortage || "0",
          daysRemaining: gap?.daysRemaining || 0,
          officialCreditScore: false,
        };
        break;
      }
      case "getCreditGuidance":
        output = {
          educational: true,
          tasks: await getCreditGuidance(userId),
          profile:
            (
              await rows(
                "SELECT utilization,age_months,overdue,on_time FROM credit_profiles WHERE user_id=?",
                [userId],
              )
            )[0] || {},
        };
        break;
      case "createAlert": {
        output = await proposeAgentAction(userId, runId, {
          action: "createReminder",
          input_json: JSON.stringify(args),
        });
        break;
      }
      case "executeSandboxTransfer":
        output = {
          code: "APPROVAL_REQUIRED",
          instruction:
            "Only the authenticated approval interface can mint and consume an execution token. Open the transfer review.",
        };
        break;
    }
    await write(
      "INSERT INTO agent_tool_calls(id,run_id,name,input,output,status) VALUES (?,?,?,?,?,'SUCCESS')",
      [
        randomUUID(),
        runId,
        name,
        JSON.stringify(args),
        JSON.stringify(output ?? null),
      ],
    );
    return output;
  } catch (e) {
    const failure = {
      code:
        e instanceof AppError
          ? e.code
          : e instanceof z.ZodError
            ? "VALIDATION_ERROR"
            : "TOOL_FAILED",
      failed: true,
      ...(e instanceof z.ZodError
        ? {
            fields: e.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
            ...(name === "requestAction"
              ? {
                  expectedInput: z.toJSONSchema(
                    agentActionCatalog[actionProposalSchema.parse(args).action]
                      .schema,
                  ),
                }
              : {}),
          }
        : {}),
      instruction:
        e instanceof z.ZodError
          ? "Correct parameters using the expected schema and information already supplied. Monetary amounts must be strings; currency is required. Retry with corrected input, or ask the user only for genuinely missing information. No action was executed."
          : "Explain this failure. Do not claim success. Ask for missing information or offer the secure form.",
    };
    await write(
      "INSERT INTO agent_tool_calls(id,run_id,name,input,output,status) VALUES (?,?,?,?,?,'FAILED')",
      [
        randomUUID(),
        runId,
        name,
        JSON.stringify(args),
        JSON.stringify(failure),
      ],
    );
    return failure;
  }
}
