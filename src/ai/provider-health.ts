import "server-only";
import { providerRequest } from "./provider-transport";
import { AppError } from "@/lib/errors";
import type { ProviderConfig } from "./provider-config";
export { providerError } from "./provider-transport";
export async function testModelConnection(config: ProviderConfig) {
  const prompt = "Reply with exactly: connection test successful";
  const body =
    config.company === "GEMINI"
      ? {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }
      : config.company === "OPENAI"
        ? {
            model: config.model,
            input: prompt,
            store: false,
            max_output_tokens: 2048,
          }
        : {
            model: config.model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2048,
          };
  const response = await providerRequest(config, body);
  const data = response.body;
  const text =
    config.company === "GEMINI"
      ? data.candidates?.[0]?.content?.parts?.some(
          (p: { text?: string; thought?: boolean }) => p.text && !p.thought,
        )
      : config.company === "OPENAI"
        ? data.output?.some(
            (p: { type: string; content?: { text?: string }[] }) =>
              p.type === "message" && p.content?.some((c) => c.text),
          )
        : config.company === "ANTHROPIC"
          ? data.content?.some(
              (p: { type: string; text?: string }) =>
                p.type === "text" && p.text,
            )
          : data.choices?.[0]?.message?.content;
  if (!text) throw new AppError("AI_INVALID_RESPONSE");
  return { model: config.model, connected: true, usage: response.usage };
}
