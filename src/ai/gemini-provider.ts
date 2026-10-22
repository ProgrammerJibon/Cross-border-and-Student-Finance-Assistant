import { providerAgent } from "./provider-engine";
import type { ChatMessage, ProviderConfig } from "./provider-config";
export async function geminiAgent(
  userId: string,
  runId: string,
  goal: string | ChatMessage[],
  locale: string,
  config: Omit<ProviderConfig, "company">,
) {
  return providerAgent(
    userId,
    runId,
    typeof goal === "string" ? [{ role: "user", content: goal }] : goal,
    locale,
    { ...config, company: "GEMINI" },
  );
}
