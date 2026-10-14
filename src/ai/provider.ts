import { mockAgent } from "./mock-provider";
import { openaiAgent } from "./openai-provider";
import { geminiAgent } from "./gemini-provider";
import { resolveModel } from "./model-config";
export const activeProvider = () =>
  process.env.AI_MODE === "openai" &&
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_MODEL
    ? "openai"
    : "mock";
export async function runAgent(
  userId: string,
  runId: string,
  goal: string,
  locale: string,
  modelId?: string | null,
) {
  const config = await resolveModel(userId, modelId);
  if (config)
    return config.company === "GEMINI"
      ? geminiAgent(userId, runId, goal, locale, config)
      : openaiAgent(userId, runId, goal, locale, config);
  if (modelId === "mock") return mockAgent(userId, runId, goal);
  return activeProvider() === "openai"
    ? openaiAgent(userId, runId, goal, locale)
    : mockAgent(userId, runId, goal);
}
