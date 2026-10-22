import "server-only";
import { D } from "@/lib/money";
import { AppError } from "@/lib/errors";
import {
  validateBaseUrl,
  type ProviderConfig,
  type ProviderUsage,
} from "./provider-config";

export function providerError(status?: number, body?: unknown) {
  const data = body as
    | {
        error?: {
          code?: string;
          type?: string;
          status?: string;
          details?: { reason?: string }[];
        };
      }
    | undefined;
  const code = data?.error?.code || data?.error?.type || "";
  return new AppError(
    status === 401 ||
      status === 403 ||
      data?.error?.details?.some((d) => d.reason === "API_KEY_INVALID")
      ? "AI_KEY_REJECTED"
      : status === 404
        ? "AI_MODEL_NOT_FOUND"
        : status === 429
          ? code === "insufficient_quota" ||
            code === "billing_hard_limit_reached"
            ? "AI_QUOTA_EXCEEDED"
            : "AI_RATE_LIMITED"
          : status === 402
            ? "AI_QUOTA_EXCEEDED"
            : status === 503 || status === 529
              ? "AI_PROVIDER_BUSY"
              : status === 413 || code === "context_length_exceeded"
                ? "AI_CONTEXT_LIMIT"
                : status === 400 || status === 422
                  ? "AI_REQUEST_REJECTED"
                  : "AI_UNAVAILABLE",
  );
}
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function readUsage(
  config: ProviderConfig,
  status: number,
  headers: Headers,
  body: Record<string, unknown>,
): ProviderUsage {
  const raw = (body.usageMetadata || body.usage || {}) as Record<
    string,
    unknown
  >;
  const input = count(
    raw.promptTokenCount ?? raw.input_tokens ?? raw.prompt_tokens,
  );
  const output = count(
    raw.candidatesTokenCount ?? raw.output_tokens ?? raw.completion_tokens,
  );
  const reasoning = count(
    raw.thoughtsTokenCount ??
      (raw.output_tokens_details as Record<string, unknown>)
        ?.reasoning_tokens ??
      (raw.completion_tokens_details as Record<string, unknown>)
        ?.reasoning_tokens,
  );
  const cache = count(
    raw.cachedContentTokenCount ??
      raw.cache_read_input_tokens ??
      (raw.input_tokens_details as Record<string, unknown>)?.cached_tokens ??
      (raw.prompt_tokens_details as Record<string, unknown>)?.cached_tokens,
  );
  const cacheWrite = count(raw.cache_creation_input_tokens);
  const actualInput =
    input === null
      ? null
      : input +
        (config.company === "ANTHROPIC" ? (cache || 0) + (cacheWrite || 0) : 0);
  const actualOutput =
    output === null
      ? null
      : output + (config.company === "GEMINI" ? reasoning || 0 : 0);
  const rate = (v: ProviderConfig["input_price"]) =>
    v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const inputRate = rate(config.input_price),
    outputRate = rate(config.output_price);
  const limits: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (
      /^(x-ratelimit|anthropic-ratelimit)-(limit|remaining|reset)-(requests|tokens|input-tokens|output-tokens)$/.test(
        name,
      ) ||
      /^anthropic-ratelimit-(requests|tokens|input-tokens|output-tokens)-(limit|remaining|reset)$/.test(
        name,
      ) ||
      name === "retry-after"
    )
      limits[name] = value.slice(0, 100);
  }
  return {
    provider: config.company,
    model: config.model,
    status,
    inputTokens: actualInput,
    outputTokens: actualOutput,
    totalTokens:
      count(raw.totalTokenCount ?? raw.total_tokens) ??
      (actualInput !== null && actualOutput !== null
        ? actualInput + actualOutput
        : null),
    cachedTokens: cache,
    reasoningTokens: reasoning,
    estimatedCostUsd:
      actualInput !== null &&
      actualOutput !== null &&
      inputRate !== null &&
      outputRate !== null
        ? D(actualInput)
            .mul(inputRate)
            .plus(D(actualOutput).mul(outputRate))
            .div(1000000)
            .toFixed(8)
        : null,
    rates: { input: inputRate, output: outputRate },
    limits,
    observedAt: new Date().toISOString(),
  };
}
export async function providerRequest(
  config: ProviderConfig,
  body: unknown,
  attempt = 0,
): Promise<{
  body: Awaited<ReturnType<Response["json"]>>;
  usage: ProviderUsage;
}> {
  let url: string;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  switch (config.company) {
    case "GEMINI":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      headers["x-goog-api-key"] = config.key;
      break;
    case "ANTHROPIC":
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = config.key;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "COMPATIBLE":
      try {
        url = validateBaseUrl(config.base_url || "") + "/chat/completions";
      } catch {
        throw new AppError("AI_ENDPOINT_NOT_ALLOWED");
      }
      headers.Authorization = `Bearer ${config.key}`;
      break;
    default:
      url = "https://api.openai.com/v1/responses";
      headers.Authorization = `Bearer ${config.key}`;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    await config.onUsage?.(readUsage(config, 0, new Headers(), {}));
    throw new AppError(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "AI_TIMEOUT"
        : "AI_UNAVAILABLE",
    );
  }
  const data = await response.json().catch(() => ({}));
  const usage = readUsage(config, response.status, response.headers, data);
  await config.onUsage?.(usage);
  if ([503, 529].includes(response.status) && attempt === 0) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    return providerRequest(config, body, attempt + 1);
  }
  if (!response.ok) throw providerError(response.status, data);
  return { body: data, usage };
}
