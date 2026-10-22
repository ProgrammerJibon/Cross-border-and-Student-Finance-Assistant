// Explicit test-server preload only. Production code never imports this file.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  const key =
    headers.get("x-goog-api-key") ||
    headers.get("x-api-key") ||
    headers.get("authorization")?.replace("Bearer ", "");
  if (!key?.startsWith("agent-e2e-")) return originalFetch(url, init);
  if (key === "agent-e2e-invalid")
    return Response.json(
      { error: { message: "private dummy key", code: "invalid_api_key" } },
      { status: 401 },
    );
  if (key === "agent-e2e-rate")
    return Response.json(
      { error: { code: "rate_limit" } },
      { status: 429, headers: { "retry-after": "2" } },
    );
  const body = JSON.parse(init.body);
  const all = JSON.stringify(body);
  const messages = body.contents || body.messages || body.input;
  const last = messages.at(-1);
  const lastText =
    last.parts?.[0]?.text ||
    (typeof last.content === "string" ? last.content : "");
  let name = "respond",
    args = {
      type: "message",
      intent: "assist",
      message: "Fixture response.",
      url: null,
      question: null,
      options: [],
    };
  if (lastText.includes("Plan Housing"))
    args = {
      ...args,
      type: "require_answer",
      intent: "create budget",
      message: "I can prepare your Housing budget.",
      question: "Which month?",
      options: ["2026-12"],
    };
  else if (lastText === "2026-12" && all.includes("Plan Housing")) {
    name = "requestAction";
    args = {
      action: "saveBudget",
      input_json: JSON.stringify({
        category: "Housing",
        amount: "123.45",
        currency: "CNY",
        month: "2026-12",
      }),
    };
  } else if (all.includes("saveBudget"))
    args = {
      ...args,
      intent: "create budget",
      message: "Your Housing budget is ready for review. Confirm to save it.",
    };
  const usage = { input_tokens: 100, output_tokens: 20, total_tokens: 120 };
  const responseHeaders = {
    "x-ratelimit-limit-requests": "100",
    "x-ratelimit-remaining-requests": "99",
  };
  if (String(url).includes("generativelanguage"))
    return Response.json(
      {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name, args } }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          totalTokenCount: 120,
        },
      },
      { headers: responseHeaders },
    );
  if (String(url).includes("anthropic"))
    return Response.json(
      {
        content: [{ type: "tool_use", id: "fixture_call", name, input: args }],
        stop_reason: "tool_use",
        usage,
      },
      { headers: responseHeaders },
    );
  if (String(url).includes("chat/completions"))
    return Response.json(
      {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "fixture_call",
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      },
      { headers: responseHeaders },
    );
  return Response.json(
    {
      output: [
        {
          type: "function_call",
          call_id: "fixture_call",
          name,
          arguments: JSON.stringify(args),
        },
      ],
      usage,
    },
    { headers: responseHeaders },
  );
};
