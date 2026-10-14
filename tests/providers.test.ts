import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiAgent } from "../src/ai/gemini-provider";
import { openaiAgent } from "../src/ai/openai-provider";
test("Gemini sends strict financial tool definitions and sanitizes upstream errors", async () => {
  const original = globalThis.fetch;
  let payload: Record<string, unknown> = {};
  try {
    globalThis.fetch = async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-key",
      );
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Verified sandbox response." }],
            },
          },
        ],
      });
    };
    const result = await geminiAgent("test", "test", "Check balance", "en", {
      key: "test-key",
      model: "test-model",
    });
    assert.equal(result.summary, "Verified sandbox response.");
    assert.ok(JSON.stringify(payload).includes("draftPayment"));
    assert.ok(!JSON.stringify(payload).includes("test-key"));
    globalThis.fetch = async () =>
      Response.json(
        { error: { message: "private provider detail" } },
        { status: 401 },
      );
    await assert.rejects(
      () =>
        geminiAgent("test", "test", "Check balance", "en", {
          key: "test-key",
          model: "test-model",
        }),
      /^Error: AI_KEY_REJECTED$/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("OpenAI uses Responses with application tools and does not persist provider responses", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.ok(
        body.tools.some(
          (tool: { name: string; strict: boolean }) =>
            tool.name === "draftPayment" && tool.strict,
        ),
      );
      return Response.json({
        id: "resp_test",
        object: "response",
        created_at: 0,
        status: "completed",
        model: "test-model",
        output: [
          {
            id: "msg_test",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: "Verified response.",
                annotations: [],
              },
            ],
          },
        ],
      });
    };
    const result = await openaiAgent("test", "test", "Check balance", "en", {
      key: "test-key",
      model: "test-model",
    });
    assert.equal(result.summary, "Verified response.");
  } finally {
    globalThis.fetch = original;
  }
});
