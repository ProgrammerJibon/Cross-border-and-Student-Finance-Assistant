import { providerAgent } from "./provider-engine";
import type { ChatMessage, ProviderConfig } from "./provider-config";
export async function openaiAgent(
  userId: string,
  runId: string,
  goal: string | ChatMessage[],
  locale: string,
  config?: Omit<ProviderConfig, "company">,
) {
  return providerAgent(
    userId,
    runId,
    typeof goal === "string" ? [{ role: "user", content: goal }] : goal,
    locale,
    {
      company: "OPENAI",
      key: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "",
      ...config,
    },
  );
}
