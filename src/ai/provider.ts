import { providerAgent } from "./provider-engine";
import { resolveModel } from "./model-config";
import { recordProviderUsage } from "./usage";
import type { ChatMessage } from "./provider-config";
import { paymentActor } from "@/services/payment.service";
import { AppError } from "@/lib/errors";
export const activeProvider = () => "live";
export async function runAgent(
  userId: string,
  runId: string,
  goal: string,
  locale: string,
  modelId?: string | null,
  history: ChatMessage[] = [],
) {
  const config = await resolveModel(userId, modelId);
  if (!config) throw new AppError("AI_UNAVAILABLE");
  const actor = await paymentActor(userId);
  return providerAgent(
    userId,
    runId,
    [...history, { role: "user", content: goal }],
    locale,
    {
      ...config,
      role: actor.role as "STUDENT" | "PARENT" | "ADMIN",
      financialEnvironment: actor.is_demo ? "DEMO" : "LIVE",
      onUsage: (usage) =>
        recordProviderUsage(userId, runId, modelId || null, usage),
    },
  );
}
