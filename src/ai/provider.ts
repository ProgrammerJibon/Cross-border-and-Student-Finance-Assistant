import { mockAgent } from "./mock-provider";
import { providerAgent } from "./provider-engine";
import { resolveModel } from "./model-config";
import { recordProviderUsage } from "./usage";
import type { ChatMessage } from "./provider-config";
import { paymentActor } from "@/services/payment.service";
export const activeProvider = () => "mock";
export async function runAgent(
  userId: string,
  runId: string,
  goal: string,
  locale: string,
  modelId?: string | null,
  history: ChatMessage[] = [],
) {
  const config = await resolveModel(userId, modelId);
  if (!config) return mockAgent(userId, runId, goal);
  return providerAgent(
    userId,
    runId,
    [...history, { role: "user", content: goal }],
    locale,
    {
      ...config,
      role: (await paymentActor(userId)).role as "STUDENT" | "PARENT" | "ADMIN",
      onUsage: (usage) =>
        recordProviderUsage(userId, runId, modelId || null, usage),
    },
  );
}
