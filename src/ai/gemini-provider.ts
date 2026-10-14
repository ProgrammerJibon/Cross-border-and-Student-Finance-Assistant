import {
  agentInstructions,
  collectAgentOutput,
  structuredAgentResult,
} from "./structured-response";
import "server-only";
import { providerError, fetchGemini } from "./provider-health";
import { z } from "zod";
import { toolSchemas, runTool, type ToolName } from "./tools";
import { AppError, requireCondition } from "@/lib/errors";
type Part = {
  text?: string;
  functionCall?: { name: string; args: unknown; id?: string };
  functionResponse?: { name: string; response: unknown; id?: string };
  [key: string]: unknown;
};
export async function geminiAgent(
  userId: string,
  runId: string,
  goal: string,
  locale: string,
  config: { key: string; model: string },
) {
  const contents: { role: string; parts: Part[] }[] = [
    { role: "user", parts: [{ text: goal }] },
  ];
  const outputs: Record<string, unknown> = {};
  const steps: string[] = [];
  const functionDeclarations = Object.entries(toolSchemas).map(
    ([name, schema]) => ({
      name,
      description: `Verified sandbox finance tool ${name}. Approval always required for transfers.`,
      parametersJsonSchema: z.toJSONSchema(schema),
    }),
  );
  for (let round = 0; round < 8; round++) {
    const response = await fetchGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.key,
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [
              {
                text: `${agentInstructions} Respond in ${locale}.`,
              },
            ],
          },
          tools: [{ functionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: "ANY" } },
          generationConfig: { maxOutputTokens: 1800 },
        }),
      },
    ).catch(() => {
      throw new AppError("AI_UNAVAILABLE");
    });
    if (!response.ok) throw providerError(response.status);
    const body = await response.json();
    const content = body.candidates?.[0]?.content as
      { role: string; parts: Part[] } | undefined;
    requireCondition(content?.parts?.length, "AI_UNAVAILABLE");
    contents.push(content);
    const calls = content.parts.filter((p) => p.functionCall);
    if (!calls.length && (outputs.respond || outputs.requestAction))
      return structuredAgentResult(
        outputs,
        steps,
        content.parts.map((p) => p.text || "").join("\n"),
      );
    if (!calls.length)
      return {
        kind:
          outputs.draftPayment || outputs.getPaymentRequests
            ? "payment"
            : outputs.compareRemittance || outputs.prepareTransfer
              ? "transfer"
              : outputs.generateBudgetSuggestion
                ? "budget"
                : outputs.getCreditGuidance
                  ? "credit"
                  : "tuition",
        summary: content.parts.map((p) => p.text || "").join("\n"),
        summaryKey: "",
        outputs,
        steps,
        amount: String(
          (
            (outputs.compareRemittance || outputs.prepareTransfer) as {
              quotes?: { receive_amount: string }[];
            }
          )?.quotes?.[0]?.receive_amount || "8000",
        ),
      };
    const parts: Part[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      requireCondition(Object.hasOwn(toolSchemas, call.name), "FORBIDDEN");
      const output = await runTool(
        userId,
        runId,
        call.name as ToolName,
        call.args,
      );
      collectAgentOutput(outputs, call.name, output);
      steps.push(call.name);
      parts.push({
        functionResponse: {
          name: call.name,
          ...(call.id ? { id: call.id } : {}),
          response: { result: output },
        },
      });
    }
    if (outputs.respond && !(outputs.respond as { failed?: boolean }).failed)
      return structuredAgentResult(outputs, steps);
    contents.push({ role: "user", parts });
  }
  throw new AppError("AI_UNAVAILABLE");
}
