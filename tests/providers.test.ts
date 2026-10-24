import { test } from "node:test";
import assert from "node:assert/strict";
import { providerAgent, providerTools } from "../src/ai/provider-engine";
import { providerRequest, readUsage } from "../src/ai/provider-transport";
import { responseSchema } from "../src/ai/action-catalog";
import {
  validateBaseUrl,
  type ProviderCompany,
  type ChatMessage,
} from "../src/ai/provider-config";
import { canUseAgentTool } from "../src/ai/tool-policy";
const answer = {
  type: "require_answer",
  intent: "plan tuition",
  message: "Please supply the due date.",
  question: "When is it due?",
  url: null,
  options: [],
};
test("provider reuses calculations, rejects unauthorized tools, and stops at respond", async (t) => {
  let round = 0;
  const executed: string[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    round++;
    const calls =
      round === 1
        ? ["calculate", "calculate", "getSettlementQueue"]
        : ["respond", "createAlert"];
    return Response.json({
      output: calls.map((name, i) => ({
        type: "function_call",
        name,
        call_id: `${round}-${i}`,
        arguments: JSON.stringify(
          name === "calculate"
            ? { operation: "add", left: "1", right: "2" }
            : answer,
        ),
      })),
    });
  });
  await providerAgent(
    "u",
    "r",
    [{ role: "user", content: "Calculate 1 + 2" }],
    "en",
    {
      company: "OPENAI",
      model: "fixture",
      key: "fixture-key",
      role: "STUDENT",
    },
    async (_u, _r, name) => {
      executed.push(name);
      return name === "respond" ? answer : { result: "3" };
    },
  );
  assert.deepEqual(executed, ["calculate", "respond"]);
  assert.equal(round, 2);
});
for (const company of [
  "GEMINI",
  "OPENAI",
  "ANTHROPIC",
  "COMPATIBLE",
] as ProviderCompany[]) {
  test(
    company +
      " sends full history, executes validated tools, and records usage",
    async () => {
      const original = globalThis.fetch;
      const history: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "history-turn-" + i,
      }));
      const captured: Record<string, unknown>[] = [];
      try {
        globalThis.fetch = async (url, init) => {
          const body = JSON.parse(String(init?.body));
          captured.push(body);
          assert.ok(!JSON.stringify(body).includes("dummy-test-key"));
          assert.ok(JSON.stringify(body).includes("history-turn-0"));
          assert.ok(JSON.stringify(body).includes("history-turn-19"));
          assert.equal(init?.redirect, "error");
          const name = captured.length === 1 ? "calculate" : "respond";
          const args =
            name === "calculate"
              ? { operation: "add", left: "0.1", right: "0.2" }
              : answer;
          const headers = { "x-ratelimit-remaining-requests": "9" };
          if (company === "OPENAI") {
            assert.equal(body.store, false);
            assert.ok(body.tools.every((t: { strict: boolean }) => t.strict));
            return Response.json(
              {
                output: [
                  {
                    type: "function_call",
                    name,
                    call_id: "call-" + captured.length,
                    arguments: JSON.stringify(args),
                  },
                ],
                usage: {
                  input_tokens: 100,
                  output_tokens: 20,
                  total_tokens: 120,
                },
              },
              { headers },
            );
          }
          if (company === "GEMINI") {
            assert.equal(
              new Headers(init?.headers).get("x-goog-api-key"),
              "dummy-test-key",
            );
            return Response.json(
              {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          thoughtSignature: "signature",
                          functionCall: { id: "c", name, args },
                        },
                      ],
                    },
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 100,
                  candidatesTokenCount: 20,
                  totalTokenCount: 120,
                },
              },
              { headers },
            );
          }
          if (company === "ANTHROPIC") {
            assert.ok(String(url).includes("api.anthropic.com"));
            return Response.json(
              {
                stop_reason: "tool_use",
                content: [{ type: "tool_use", id: "c", name, input: args }],
                usage: { input_tokens: 100, output_tokens: 20 },
              },
              { headers },
            );
          }
          assert.ok(String(url).endsWith("/chat/completions"));
          return Response.json(
            {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "c",
                        type: "function",
                        function: { name, arguments: JSON.stringify(args) },
                      },
                    ],
                  },
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
              },
            },
            { headers },
          );
        };
        const recorded: unknown[] = [];
        const result = await providerAgent(
          "owner",
          "run",
          history,
          "en",
          {
            company,
            model: "test-model",
            key: "dummy-test-key",
            base_url: "https://api.deepseek.com/v1",
            input_price: 1,
            output_price: 2,
            onUsage: async (u) => {
              recorded.push(u);
            },
          },
          async (_user, _run, name, args) =>
            name === "respond" ? responseSchema.parse(args) : { result: "0.3" },
        );
        assert.deepEqual(result.steps, ["calculate", "respond"]);
        assert.equal(result.operationStatus, "NEEDS_INFORMATION");
        assert.equal(result.intent, "plan tuition");
        assert.equal(result.usage.length, 2);
        assert.equal(recorded.length, 2);
        assert.equal(result.usage[0].estimatedCostUsd, "0.00014000");
        assert.equal(result.usage[0].totalTokens, 120);
        assert.equal(
          result.usage[0].limits["x-ratelimit-remaining-requests"],
          "9",
        );
        assert.ok(JSON.stringify(captured[1]).includes("0.3"));
        if (company === "GEMINI")
          assert.ok(JSON.stringify(captured[1]).includes("signature"));
      } finally {
        globalThis.fetch = original;
      }
    },
  );
}
test("provider errors are sanitized, including quota, timeout and malformed output", async () => {
  const original = globalThis.fetch;
  const config = { company: "OPENAI" as const, model: "test", key: "secret" };
  try {
    for (const [status, error, expected] of [
      [401, {}, "AI_KEY_REJECTED"],
      [404, {}, "AI_MODEL_NOT_FOUND"],
      [429, {}, "AI_RATE_LIMITED"],
      [429, { code: "insufficient_quota" }, "AI_QUOTA_EXCEEDED"],
      [503, {}, "AI_PROVIDER_BUSY"],
      [400, { code: "context_length_exceeded" }, "AI_CONTEXT_LIMIT"],
    ] as const) {
      globalThis.fetch = async () =>
        Response.json(
          { error: { ...error, message: "secret upstream data" } },
          { status },
        );
      await assert.rejects(
        () => providerRequest(config, {}),
        new RegExp("^Error: " + expected + "$"),
      );
    }
    globalThis.fetch = async () => {
      throw new DOMException("secret", "TimeoutError");
    };
    await assert.rejects(
      () => providerRequest(config, {}),
      /^Error: AI_TIMEOUT$/,
    );
    globalThis.fetch = async () => Response.json({ output: [] });
    await assert.rejects(
      () => providerAgent("u", "r", [], "en", config),
      /^Error: AI_INVALID_RESPONSE$/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("provider tools satisfy OpenAI strict object requirements", () => {
  for (const tool of providerTools()) {
    const p = tool.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties: boolean;
    };
    assert.equal(p.additionalProperties, false, tool.name);
    assert.deepEqual(
      [...(p.required || [])].sort(),
      Object.keys(p.properties).sort(),
      tool.name,
    );
  }
});
test("usage never fabricates missing tokens or pricing; cache and reasoning totals are included", () => {
  const config = {
    company: "ANTHROPIC" as const,
    model: "test",
    key: "secret",
  };
  const unknown = readUsage(config, 429, new Headers(), {});
  assert.equal(unknown.totalTokens, null);
  assert.equal(unknown.estimatedCostUsd, null);
  const usage = readUsage(config, 200, new Headers(), {
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 30,
      output_tokens: 5,
    },
  });
  assert.equal(usage.inputTokens, 60);
  assert.equal(usage.totalTokens, 65);
  const gemini = readUsage(
    { ...config, company: "GEMINI" },
    200,
    new Headers(),
    {
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 7,
      },
    },
  );
  assert.equal(gemini.outputTokens, 12);
});
test("compatible endpoints and tool roles reject unauthorized access", () => {
  for (const url of [
    "http://localhost:3000",
    "https://127.0.0.1/v1",
    "https://api.deepseek.com.evil.test/v1",
    "https://api.deepseek.com/v1?key=secret",
    "https://user:secret@api.deepseek.com/v1",
  ])
    assert.throws(() => validateBaseUrl(url));
  assert.equal(
    validateBaseUrl("https://api.deepseek.com/v1/"),
    "https://api.deepseek.com/v1",
  );
  assert.equal(canUseAgentTool("ADMIN", "getAccounts"), false);
  assert.equal(canUseAgentTool("PARENT", "getStudentProfile"), false);
  assert.equal(canUseAgentTool("STUDENT", "getSettlementQueue"), false);
  assert.equal(canUseAgentTool("ADMIN", "getSettlementQueue"), true);
  assert.equal(canUseAgentTool("MODERATOR", "respond"), false);
});
