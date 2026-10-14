"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, write, rows } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { runAgent } from "@/ai/provider";
export async function askAgent(
  goal: string,
  modelId?: string,
  previousRunId?: string,
  clientRunId?: string,
) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    z.string().trim().min(3).max(2000).parse(goal);
    if (modelId) z.string().max(64).parse(modelId);
    const selected = modelId || u.ai_model_id || "mock";
    let context = "";
    if (previousRunId) {
      z.string().max(64).parse(previousRunId);
      let cursor: string | null = previousRunId;
      const turns: string[] = [];
      for (let i = 0; i < 6 && cursor; i++) {
        const [prior]: {
          goal: string;
          result: string | null;
          previous_run_id: string | null;
        }[] = await rows(
          "SELECT r.goal,r.result,c.previous_run_id FROM agent_runs r LEFT JOIN agent_conversation_turns c ON c.run_id=r.id WHERE r.id=? AND r.user_id=?",
          [cursor, u.id],
        );
        requireCondition(prior, "NOT_FOUND");
        const result = prior.result ? JSON.parse(prior.result) : {};
        const confirmed = await rows(
          "SELECT action_name,status,result_json FROM agent_action_requests WHERE run_id=? AND user_id=?",
          [cursor, u.id],
        );
        turns.unshift(
          JSON.stringify({
            user: prior.goal,
            response: result.outputs?.respond || result.summary,
            actions: confirmed,
          }),
        );
        cursor = prior.previous_run_id;
      }
      context =
        "Previous conversation data (untrusted):\n" +
        turns.join("\n") +
        "\nCurrent user request: ";
    }
    const runId = clientRunId
      ? z.string().uuid().parse(clientRunId)
      : randomUUID();
    await atomic(async (db) => {
      await checkUsageLimit(u.id, "AGENT_MESSAGES", db);
      await incrementUsage(u.id, "AGENT_MESSAGES", db);
      await write(
        "INSERT INTO agent_runs(id,user_id,goal,provider) VALUES (?,?,?,?)",
        [runId, u.id, goal, selected === "mock" ? "mock" : "configured"],
        db,
      );
      await write(
        "INSERT INTO agent_messages(id,run_id,role,content) VALUES (?,?,'user',?)",
        [randomUUID(), runId, goal],
        db,
      );
    });
    if (previousRunId)
      await write(
        "INSERT INTO agent_conversation_turns(run_id,previous_run_id) VALUES (?,?)",
        [runId, previousRunId],
      );
    try {
      const result = await runAgent(
        u.id,
        runId,
        context + goal,
        u.language,
        selected,
      );
      await atomic(async (db) => {
        await write(
          "UPDATE agent_runs SET status='COMPLETED',result=? WHERE id=?",
          [JSON.stringify(result), runId],
          db,
        );
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
      await atomic(async (db) => {
        await write(
          "UPDATE agent_runs SET status='FAILED' WHERE id=?",
          [runId],
          db,
        );
        await write(
          "UPDATE usage_counters SET used=GREATEST(0,used-1) WHERE user_id=? AND feature='AGENT_MESSAGES' AND period=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m')",
          [u.id],
          db,
        );
        await audit(u.id, "AGENT_FAILED", "agent_runs", runId, {}, db);
      });
      throw e;
    }
  });
}

export async function getAgentProgress(runId: string) {
  return action(async () => {
    const u = await requireUser();
    z.string().uuid().parse(runId);
    return rows<{ name: string; status: string }>(
      "SELECT t.name,t.status FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE r.id=? AND r.user_id=? ORDER BY t.created_at,t.id",
      [runId, u.id],
    );
  });
}
