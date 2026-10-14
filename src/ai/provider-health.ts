import "server-only";
import OpenAI from "openai";
import { AppError } from "@/lib/errors";

// Only stable codes cross the server boundary; provider bodies can contain secrets.
export function providerError(status?: number) {
  return new AppError(
    status === 401 || status === 403
      ? "AI_KEY_REJECTED"
      : status === 404
        ? "AI_MODEL_NOT_FOUND"
        : status === 429
          ? "AI_QUOTA_EXCEEDED"
          : status === 503
            ? "AI_PROVIDER_BUSY"
            : status === 400
              ? "AI_REQUEST_REJECTED"
              : "AI_UNAVAILABLE",
  );
}
export async function testModelConnection(config: {
  company: "OPENAI" | "GEMINI";
  model: string;
  key: string;
}) {
  const prompt = "Reply with exactly: connection test successful";
  if (config.company === "GEMINI") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.key,
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      },
    ).catch(() => {
      throw providerError();
    });
    if (!response.ok) throw providerError(response.status);
    const body = await response.json();
    if (
      !body.candidates?.[0]?.content?.parts?.some(
        (p: { text?: string; thought?: boolean }) => p.text && !p.thought,
      )
    )
      throw providerError();
  } else {
    const client = new OpenAI({
      apiKey: config.key,
      timeout: 30000,
      maxRetries: 0,
    });
    const response = await client.responses
      .create({
        model: config.model,
        input: prompt,
        store: false,
        max_output_tokens: 2048,
      })
      .catch((error: unknown) => {
        throw providerError(
          error instanceof OpenAI.APIError ? error.status : undefined,
        );
      });
    if (!response.output_text) throw providerError();
  }
  return { model: config.model, connected: true };
}

export async function fetchGemini(url: string, init: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(45000),
    }).catch(() => {
      throw providerError();
    });
    if (response.status !== 503 || attempt === 1) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw providerError(503);
}
