import { responseSchema, actionProposalSchema } from "../action-catalog";
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
  createBeneficiary,
  paymentWorkspace,
  paymentActor,
  previewPaymentRisk,
} from "@/services/payment.service";
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
  requireCondition(["STUDENT", "PARENT"].includes(actor.role));
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
          confirmationRequired: true,
          instruction:
            "Use draftPayment with verified account IDs. Card details must be collected only by the secure payment form, never in chat. Drafts require the user confirmation button; external methods enter manual settlement.",
        };
        break;
      }
      case "getPaymentRequests":
        output = (await paymentWorkspace(userId)).requests;
        break;
      case "getBeneficiaries":
        output = (await paymentWorkspace(userId)).beneficiaries;
        break;
      case "addBeneficiary":
        output = await createBeneficiary(userId, args);
        break;
      case "draftPayment":
        output = await createPaymentDraft(userId, args, `agent-${runId}`);
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
          "SELECT category,currency,type,SUM(amount) total,COUNT(*) count FROM transactions WHERE user_id=? AND date>=DATE_SUB(UTC_DATE(),INTERVAL 30 DAY) GROUP BY category,currency,type",
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
        const [p] = await rows<{ auto_alerts: number }>(
          "SELECT auto_alerts FROM user_preferences WHERE user_id=?",
          [userId],
        );
        requireCondition(p.auto_alerts, "APPROVAL_REQUIRED");
        const v = toolSchemas.createAlert.parse(args);
        await write(
          "INSERT INTO alerts(id,user_id,type,severity,detail) VALUES (?,?,'AI','INFO',?)",
          [randomUUID(), userId, v.detail],
        );
        output = { created: true };
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
    await write(
      "INSERT INTO agent_tool_calls(id,run_id,name,input,output,status) VALUES (?,?,?,?,?,'FAILED')",
      [
        randomUUID(),
        runId,
        name,
        JSON.stringify(args),
        JSON.stringify({
          code: e instanceof AppError ? e.code : "TOOL_FAILED",
        }),
      ],
    );
    return {
      code: e instanceof AppError ? e.code : "TOOL_FAILED",
      failed: true,
      instruction:
        "Explain this failure. Do not claim success. Ask for missing information or offer the payment form.",
    };
  }
}
