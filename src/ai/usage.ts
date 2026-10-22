import "server-only";
import { randomUUID } from "node:crypto";
import { rows, write } from "@/lib/db";
import { parseJson } from "@/lib/json";
import type { ProviderUsage } from "./provider-config";
export async function recordProviderUsage(
  userId: string,
  runId: string | null,
  modelId: string | null,
  usage: ProviderUsage,
) {
  await write(
    "INSERT INTO agent_provider_usage(id,user_id,run_id,model_id,provider,model,http_status,input_tokens,output_tokens,total_tokens,estimated_cost_usd,details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      randomUUID(),
      userId,
      runId,
      modelId,
      usage.provider,
      usage.model,
      usage.status,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      usage.estimatedCostUsd,
      JSON.stringify(usage),
    ],
  );
}
export async function agentUsage(userId: string) {
  const totals = await rows<{
    provider: string;
    model: string;
    requests: number;
    failures: number;
    input_tokens: string | null;
    output_tokens: string | null;
    total_tokens: string | null;
    estimated_cost_usd: string | null;
    unmetered: number;
    unpriced: number;
  }>(
    "SELECT provider,model,COUNT(*) requests,SUM(http_status<200 OR http_status>=300) failures,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(total_tokens) total_tokens,SUM(estimated_cost_usd) estimated_cost_usd,SUM(total_tokens IS NULL) unmetered,SUM(estimated_cost_usd IS NULL) unpriced FROM agent_provider_usage WHERE user_id=? AND created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01') GROUP BY provider,model",
    [userId],
  );
  const latest = await rows<{ details: string }>(
    "SELECT details FROM agent_provider_usage WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
    [userId],
  );
  const [counter] = await rows<{ used: number }>(
    "SELECT used FROM usage_counters WHERE user_id=? AND feature='AGENT_MESSAGES' AND period=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m')",
    [userId],
  );
  const [sub] = await rows<{ limits: string; status: string; ends_at: string }>(
    "SELECT p.limits,s.status,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=?",
    [userId],
  );
  const limit =
    parseJson<Record<string, number>>(sub?.limits, {}).AGENT_MESSAGES ?? null;
  return {
    totals,
    latest: latest[0]
      ? parseJson<ProviderUsage | null>(latest[0].details, null)
      : null,
    plan: {
      used: counter?.used || 0,
      limit,
      remaining:
        limit === null ? null : Math.max(0, limit - (counter?.used || 0)),
      status: sub?.status || null,
      endsAt: sub?.ends_at || null,
    },
    period: new Date().toISOString().slice(0, 7),
  };
}
