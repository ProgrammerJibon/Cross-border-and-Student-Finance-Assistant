import "server-only";
import { rows, type DB } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { D, money } from "@/lib/money";
import { financialIdentity } from "@/lib/financial-environment";

export async function fundingAssistance(userId: string, requestId: string, db?: DB) {
  const user = await financialIdentity(userId, db);
  const [draft] = await rows<{id: string; account_id: string; amount: string; currency: string; balance: string; expired: number; status: string}>(
    "SELECT r.id,r.account_id,r.amount,r.currency,r.status,a.balance,r.created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) expired FROM financial_requests r JOIN accounts a ON a.id=r.account_id AND a.user_id=r.user_id WHERE r.id=? AND r.user_id=? AND r.kind<>'TOPUP' AND a.archived=0", [requestId,userId], db);
  requireCondition(draft && draft.status === "DRAFT", "NOT_FOUND");
  const shortfall = money(D(draft.amount).gt(draft.balance) ? D(draft.amount).minus(draft.balance) : D(0));
  return {requestId,accountId:draft.account_id,currency:draft.currency,available:draft.balance,
    required:draft.amount,shortfall,expired:!!draft.expired,canFund:!!user.is_demo && !draft.expired,
    environment:user.environment,confirmationRequired:true,
    instruction: draft.expired ? "QUOTE_EXPIRED" : user.is_demo ? "fundingResumeHelp" : "LIVE_RAIL_UNAVAILABLE"};
}
