import "server-only";
import { rows } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { parseJson } from "@/lib/json";
import type { ChatMessage } from "./provider-config";
export type SavedTurn = {
  id: string;
  goal: string;
  result: string | null;
  status: string;
  provider: string;
  created_at: string;
  previous_run_id: string | null;
};
export async function loadConversation(userId: string, lastId: string) {
  const turns: SavedTurn[] = [];
  const seen = new Set<string>();
  let cursor: string | null = lastId;
  while (cursor) {
    requireCondition(!seen.has(cursor), "AI_HISTORY_INVALID");
    seen.add(cursor);
    const [turn]: SavedTurn[] = await rows(
      "SELECT r.id,r.goal,r.result,r.status,r.provider,r.created_at,c.previous_run_id FROM agent_runs r LEFT JOIN agent_conversation_turns c ON c.run_id=r.id WHERE r.id=? AND r.user_id=?",
      [cursor, userId],
    );
    requireCondition(turn, "NOT_FOUND");
    const actions = await rows(
      "SELECT id,action_name,input_json,status,result_json,created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) expired FROM agent_action_requests WHERE run_id=? AND user_id=? ORDER BY created_at,id",
      [turn.id, userId],
    );
    const result = parseJson<{
      outputs?: Record<string, unknown>;
      steps?: string[];
      summary?: string;
      toolCalls?: unknown[];
    }>(turn.result, {});
    const calls = await rows<{ name: string; status: string }>(
      "SELECT name,status FROM agent_tool_calls WHERE run_id=? ORDER BY created_at,id",
      [turn.id],
    );
    result.toolCalls = calls;
    if (!result.steps?.length) result.steps = calls.map((call) => call.name);
    if (actions.length) {
      result.outputs ||= {};
      result.outputs.proposedActions = actions.map((a) => ({
        id: a.id,
        action: a.action_name,
        input: parseJson(a.input_json, {}),
        status: a.status === "PENDING" && a.expired ? "EXPIRED" : a.status,
        // Invitation secrets belong to the secure form, never to provider context.
        result:
          a.action_name === "inviteStudent"
            ? { invitationCreated: a.status === "COMPLETED" }
            : parseJson(a.result_json, null),
        confirmationRequired: true,
      }));
    }
    const payments = await rows(
      "SELECT id,kind,method,amount,currency,recipient,receive_amount,receive_currency,status FROM financial_requests WHERE user_id=? AND idempotency_key=?",
      [userId, `agent-${turn.id}`],
    );
    if (payments.length) {
      result.outputs ||= {};
      result.outputs.paymentStatus = payments;
    }
    if (turn.result || actions.length || payments.length || calls.length)
      turn.result = JSON.stringify(result);
    turns.unshift(turn);
    cursor = turn.previous_run_id;
  }
  return turns;
}
export function conversationMessages(turns: SavedTurn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    messages.push({ role: "user", content: turn.goal });
    messages.push({
      role: "assistant",
      content: JSON.stringify({
        status: turn.status,
        result: parseJson(turn.result, null),
      }),
    });
  }
  // Never silently discard earlier turns. Let users keep the thread and choose a
  // larger-context model; this bound protects the server before network I/O.
  requireCondition(
    Buffer.byteLength(JSON.stringify(messages)) <= 2_000_000,
    "AI_CONTEXT_LIMIT",
  );
  return messages;
}
