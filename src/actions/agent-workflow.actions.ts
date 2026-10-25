"use server";
import { parseJson } from "@/lib/json";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, AppError, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { agentActionCatalog, type AgentActionName } from "@/ai/action-catalog";
import type { Result } from "@/types";
async function dispatch(
  name: AgentActionName,
  v: Record<string, unknown>,
): Promise<Result<unknown>> {
  switch (name) {
    case "requestSupport":
      return (await import("./wallet.actions")).requestSupport(v,`agent-support:${crypto.randomUUID()}`);
    case "decideSupport":
      return (await import("./wallet.actions")).decideSupport(String(v.request_id),String(v.decision));
    case "decideApproval":
      return (await import("./parent.actions")).decideApproval(v);
    case "settlePaymentRequest":
      return (await import("./payment.actions")).settlePaymentRequest(v);
    case "savePaymentMethod":
      return (await import("./payment.actions")).savePaymentMethod(v);
    case "savePaymentPolicy":
      return (await import("./payment.actions")).savePaymentPolicy(v);
    case "saveRate":
    case "saveFinancialPolicy":
    case "saveCorridor":
    case "saveProvider":
    case "savePlan":
    case "saveCreditGuidance":
      return (await import("./admin.actions"))[name](v);
    case "saveCountry":
    case "saveCurrency":
      return (await import("./platform.actions"))[name](v);
    case "saveAccount":
      return (await import("./account.actions")).saveAccount(v);
    case "archiveAccount":
      return (await import("./account.actions")).archiveAccount(
        String(v.account_id),
      );
    case "saveBudget":
      return (await import("./budget.actions")).saveBudget(v);
    case "saveTuition":
      return (await import("./tuition.actions")).saveTuition(v);
    case "saveFundingPlan":
      return (await import("./tuition.actions")).saveFundingPlan(v);
    case "addTransaction":
      return (await import("./transaction.actions")).addTransaction(v);
    case "categorizeTransaction":
      return (await import("./transaction.actions")).categorizeTransaction(
        String(v.transaction_id),
        String(v.category),
      );
    case "createReminder":
      return (await import("./alert.actions")).createReminder(String(v.detail));
    case "updateAlert":
      return (await import("./alert.actions")).updateAlert(v);
    case "updateCredit":
      return (await import("./credit.actions")).updateCredit(v);
    case "toggleCreditTask":
      return (await import("./credit.actions")).toggleCreditTask(
        String(v.task),
        Boolean(v.completed),
      );
    case "updatePreferences":
      return (await import("./preferences.actions")).updatePreferences(v);
    case "updateProfile":
      return (await import("./user.actions")).updateProfile(String(v.name));
    case "inviteStudent":
      return (await import("./parent.actions")).inviteStudent(String(v.email));
    case "acceptInvitation":
      return (await import("./parent.actions")).acceptInvitation(
        String(v.token),
      );
    case "updateFamily":
      return (await import("./parent.actions")).updateFamily(v);
    case "updateControls":
      return (await import("./parent.actions")).updateControls(v);
    case "addBeneficiary":
      return (await import("./payment.actions")).addBeneficiary(v);
    case "removeBeneficiary":
      return (await import("./payment.actions")).removeBeneficiary(
        String(v.beneficiary_id),
      );
    case "cancelPayment":
      return (await import("./payment.actions")).cancelPaymentRequest(
        String(v.request_id),
      );
    case "parentPaymentDecision":
      return (await import("./payment.actions")).parentPaymentDecision({
        ...v,
        id: v.request_id,
      });
    case "parentBeneficiaryDecision":
      return (await import("./payment.actions")).parentBeneficiaryDecision({
        ...v,
        id: v.beneficiary_id,
      });
    case "cancelSubscription":
      return (await import("./subscription.actions")).cancelSubscription();
    case "manageSavedCard":
      return (await import("./platform.actions")).manageSavedCard(v);
    case "selectAiModel":
      return (await import("./platform.actions")).selectAiModel(
        String(v.model_id),
      );
    case "submitReport":
      return (await import("./report.actions")).submitReport(v);
  }
}
export async function confirmAgentAction(requestId: string) {
  return action(async () => {
    const u = await requireUser();
    z.string().min(1).max(64).parse(requestId);
    const proposal = await atomic(async (db) => {
      const [r] = await rows<{
        action_name: AgentActionName;
        input_json: string;
        status: string;
        result_json: string | null;
        expired: number;
      }>(
        "SELECT action_name,input_json,status,result_json,created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) expired FROM agent_action_requests WHERE id=? AND user_id=? FOR UPDATE",
        [requestId, u.id],
        db,
      );
      requireCondition(r, "NOT_FOUND");
      if (r.status === "COMPLETED") return r;
      requireCondition(r.status === "PENDING", "INVALID_STATE");
      requireCondition(!r.expired, "EXPIRED");
      const def = agentActionCatalog[r.action_name];
      requireCondition(
        def && (def.roles as readonly string[]).includes(u.role),
        "FORBIDDEN",
      );
      def.schema.parse(parseJson(r.input_json, {}));
      await write(
        "UPDATE agent_action_requests SET status='EXECUTING' WHERE id=?",
        [requestId],
        db,
      );
      return r;
    });
    if (proposal.status === "COMPLETED")
      return {
        status: "COMPLETED",
        result: parseJson(proposal.result_json, null) as unknown,
      };
    const input = agentActionCatalog[proposal.action_name].schema.parse(
      parseJson(proposal.input_json, {}),
    ) as Record<string, unknown>;
    let result: Result<unknown>;
    try {
      result = await dispatch(proposal.action_name, input);
    } catch {
      result = {
        success: false,
        error: "ACTION_FAILED",
        code: "ACTION_FAILED",
      };
    }
    await atomic(async (db) => {
      await write(
        "UPDATE agent_action_requests SET status=?,result_json=? WHERE id=?",
        [
          result.success ? "COMPLETED" : "FAILED",
          JSON.stringify(result.success ? result.data : { code: result.code }),
          requestId,
        ],
        db,
      );
      await audit(
        u.id,
        result.success ? "AGENT_ACTION_COMPLETED" : "AGENT_ACTION_FAILED",
        "agent_action_requests",
        requestId,
        { action: proposal.action_name },
        db,
      );
    });
    if (!result.success) throw new AppError(result.code);
    return { status: "COMPLETED", result: result.data };
  });
}
export async function dismissAgentAction(requestId: string) {
  return action(async () => {
    const u = await requireUser();
    const r = await write(
      "UPDATE agent_action_requests SET status='CANCELLED' WHERE id=? AND user_id=? AND status='PENDING'",
      [z.string().max(64).parse(requestId), u.id],
    );
    requireCondition(r.affectedRows, "INVALID_STATE");
    return null;
  });
}
export async function getAgentActionStatus(ids: string[]) {
  return action(async () => {
    const u = await requireUser();
    z.array(z.string().max(64)).max(20).parse(ids);
    if (!ids.length) return [];
    return rows(
      "SELECT id,IF(status='PENDING' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE),'EXPIRED',status) status,result_json FROM agent_action_requests WHERE user_id=? AND id IN (" +
        ids.map(() => "?").join(",") +
        ")",
      [u.id, ...ids],
    );
  });
}
