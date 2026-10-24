"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireWorkspaceUser as requireUser } from "@/lib/auth";
import { atomic, write, rows } from "@/lib/db";
import { action, AppError, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { runAgent } from "@/ai/provider";
import { resolveModel } from "@/ai/model-config";
import {
  conversationMessages,
  loadConversation,
  type SavedTurn,
} from "@/ai/conversation";
import { agentUsage } from "@/ai/usage";
export async function askAgent(
  goal: string,
  modelId?: string,
  previousRunId?: string,
  clientRunId?: string,
) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT", "ADMIN"].includes(u.role));
    goal = z.string().trim().min(1).max(2000).parse(goal);
    if (modelId) z.string().max(64).parse(modelId);
    const selected = modelId || u.ai_model_id;
    requireCondition(selected && selected !== "mock", "AI_UNAVAILABLE");
    const config = await resolveModel(u.id, selected);
    requireCondition(config, "AI_UNAVAILABLE");
    const history = previousRunId
      ? conversationMessages(
          await loadConversation(
            u.id,
            z.string().min(1).max(64).parse(previousRunId),
          ),
        )
      : [];
    const runId = clientRunId
      ? z.string().uuid().parse(clientRunId)
      : randomUUID();
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const existing = await rows(
        "SELECT id FROM agent_runs WHERE id=?",
        [runId],
        db,
      );
      requireCondition(!existing.length, "AI_REQUEST_EXISTS");
      // A crashed worker must not hold the chat forever. It cannot execute tools
      // after this status changes, and its persisted reviews remain inspectable.
      await write(
        "UPDATE agent_runs SET status='INTERRUPTED' WHERE user_id=? AND status='RUNNING' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)",
        [u.id],
        db,
      );
      requireCondition(
        !(
          await rows(
            "SELECT id FROM agent_runs WHERE user_id=? AND status='RUNNING'",
            [u.id],
            db,
          )
        ).length,
        "AI_RUN_IN_PROGRESS",
      );
      if (u.role !== "ADMIN") await checkUsageLimit(u.id, "AGENT_MESSAGES", db);
      await incrementUsage(u.id, "AGENT_MESSAGES", db);
      await write(
        "INSERT INTO agent_runs(id,user_id,goal,provider) VALUES (?,?,?,?)",
        [runId, u.id, goal, config.company],
        db,
      );
      await write(
        "INSERT INTO agent_messages(id,run_id,role,content) VALUES (?,?,'user',?)",
        [randomUUID(), runId, goal],
        db,
      );
      if (previousRunId)
        await write(
          "INSERT INTO agent_conversation_turns(run_id,previous_run_id) VALUES (?,?)",
          [runId, previousRunId],
          db,
        );
    });
    try {
      const result = await runAgent(
        u.id,
        runId,
        goal,
        u.language,
        selected,
        history,
      );
      await atomic(async (db) => {
        const updated = await write(
          "UPDATE agent_runs SET status='COMPLETED',result=? WHERE id=? AND user_id=? AND status='RUNNING'",
          [JSON.stringify(result), runId, u.id],
          db,
        );
        requireCondition(updated.affectedRows, "AI_INTERRUPTED");
        await write(
          "INSERT INTO agent_messages(id,run_id,role,content) VALUES (?,?,'assistant',?)",
          [randomUUID(), runId, JSON.stringify(result)],
          db,
        );
        await audit(
          u.id,
          "AGENT_COMPLETED",
          "agent_runs",
          runId,
          { steps: result.steps },
          db,
        );
      });
      return { id: runId, ...result };
    } catch (e) {
      const code = e instanceof AppError ? e.code : "AI_UNAVAILABLE";
      await atomic(async (db) => {
        await write(
          "UPDATE agent_runs SET status='FAILED',result=? WHERE id=? AND user_id=? AND status='RUNNING'",
          [
            JSON.stringify({ error: code, outputs: {}, steps: [] }),
            runId,
            u.id,
          ],
          db,
        );
        await write(
          "UPDATE usage_counters SET used=GREATEST(0,used-1) WHERE user_id=? AND feature='AGENT_MESSAGES' AND period=(SELECT DATE_FORMAT(created_at,'%Y-%m') FROM agent_runs WHERE id=?)",
          [u.id, runId],
          db,
        );
        await audit(u.id, "AGENT_FAILED", "agent_runs", runId, { code }, db);
      });
      throw new AppError(code);
    }
  });
}
export async function getAgentProgress(runId: string) {
  return action(async () => {
    const u = await requireUser();
    z.string().max(64).parse(runId);
    return rows<{ name: string; status: string }>(
      "SELECT t.name,t.status FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE r.id=? AND r.user_id=? ORDER BY t.created_at,t.id",
      [runId, u.id],
    );
  });
}
export async function getAgentHistory(page = 0) {
  return action(async () => {
    const u = await requireUser();
    z.number().int().min(0).max(100000).parse(page);
    const runs = await rows<SavedTurn>(
      "SELECT r.id,r.goal,r.status,r.provider,r.created_at,c.previous_run_id FROM agent_runs r LEFT JOIN agent_conversation_turns c ON c.run_id=r.id WHERE r.user_id=? AND NOT EXISTS (SELECT 1 FROM agent_conversation_turns act WHERE act.previous_run_id=r.id) ORDER BY r.created_at DESC,r.id DESC LIMIT 51 OFFSET " +
        page * 50,
      [u.id],
    );
    return { runs: runs.slice(0, 50), hasMore: runs.length > 50 };
  });
}
export async function getAgentConversation(runId: string) {
  return action(async () =>
    loadConversation(
      (await requireUser()).id,
      z.string().min(1).max(64).parse(runId),
    ),
  );
}
export async function getAgentUsage() {
  return action(async () => {
    const u = await requireUser();
    const usage = await agentUsage(u.id);
    return {
      ...usage,
      plan:
        u.role === "ADMIN"
          ? { ...usage.plan, limit: null, remaining: null, status: "ADMIN" }
          : usage.plan,
    };
  });
}
