import { z } from "zod";

export const providerCompany = z.enum([
  "OPENAI",
  "GEMINI",
  "ANTHROPIC",
  "COMPATIBLE",
]);
export type ProviderCompany = z.infer<typeof providerCompany>;
// Exact HTTPS endpoints, not user-controlled proxy URLs. Operators may explicitly
// allow additional trusted endpoints via AI_COMPATIBLE_BASE_URLS.
export const compatibleEndpoints = [
  "https://api.deepseek.com/v1",
  "https://api.groq.com/openai/v1",
  "https://openrouter.ai/api/v1",
  "https://api.mistral.ai/v1",
  "https://api.x.ai/v1",
];
export function validateBaseUrl(value: string) {
  const normalized = value.replace(/\/+$/, "");
  const allowed = [
    ...compatibleEndpoints,
    ...(process.env.AI_COMPATIBLE_BASE_URLS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  const url = new URL(normalized);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !allowed.includes(normalized)
  )
    throw new Error("AI_ENDPOINT_NOT_ALLOWED");
  return normalized;
}
export const priceSchema = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().finite().min(0).max(100000).nullable(),
);

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ProviderUsage = {
  provider: ProviderCompany;
  model: string;
  status: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: string | null;
  rates: { input: number | null; output: number | null };
  limits: Record<string, string>;
  observedAt: string;
};
export type ProviderConfig = {
  financialEnvironment?: "DEMO" | "LIVE";
  role?: "STUDENT" | "PARENT" | "ADMIN";
  company: ProviderCompany;
  model: string;
  key: string;
  base_url?: string | null;
  input_price?: number | string | null;
  output_price?: number | string | null;
  onUsage?: (usage: ProviderUsage) => Promise<void>;
};
