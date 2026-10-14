import {
  agentInstructions,
  collectAgentOutput,
  structuredAgentResult,
} from "./structured-response";
import "server-only";
import { providerError } from "./provider-health";
import OpenAI from "openai";
import type {
  ResponseInputItem,
  FunctionTool,
} from "openai/resources/responses/responses";
import { z } from "zod";
import { toolSchemas, runTool, type ToolName } from "./tools";
import { requireCondition } from "@/lib/errors";
export async function openaiAgent(
  userId: string,
  runId: string,
  goal: string,
  locale: string,
  config?: { key: string; model: string },
) {
  requireCondition(
    config || (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
    "AI_UNAVAILABLE",
  );
  const client = new OpenAI({
    apiKey: config?.key || process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 1,
  });
  const tools: FunctionTool[] = Object.entries(toolSchemas).map(
    ([name, schema]) => ({
      type: "function",
      name,
      description: `Application-owned sandbox financial tool: ${name}. Never invent financial values or approval. For wallet payments, topups, withdrawals and external settlement, use getPaymentOptions, getAccounts and draftPayment. Never ask for card numbers or CVV in chat.`,
      parameters: z.toJSONSchema(schema) as Record<string, unknown>,
      strict: true,
    }),
  );
  const input: ResponseInputItem[] = [{ role: "user", content: goal }];
  const outputs: Record<string, unknown> = {};
  const steps: string[] = [];
  for (let round = 0; round < 8; round++) {
    const response = await client.responses
      .create({
        model: config?.model || process.env.OPENAI_MODEL!,
        instructions: `${agentInstructions} Respond in ${locale}.`,
        tools,
        tool_choice: "required",
        input,
        store: false,
        max_output_tokens: 1800,
      })
      .catch((error: unknown) => {
        throw providerError(
          error instanceof OpenAI.APIError ? error.status : undefined,
        );
      });
    for (const item of response.output)
      if (
        item.type === "message" ||
        item.type === "function_call" ||
        item.type === "reasoning"
      )
        input.push(item);
    const calls = response.output.filter(
      (item) => item.type === "function_call",
    );
    if (!calls.length && (outputs.respond || outputs.requestAction))
      return structuredAgentResult(outputs, steps, response.output_text);
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
        summary: response.output_text,
        outputs,
        steps,
        summaryKey: "",
        amount: String(
          (
            (outputs.compareRemittance || outputs.prepareTransfer) as {
              quotes?: { receive_amount: string }[];
            }
          )?.quotes?.[0]?.receive_amount || "8000",
        ),
      };
    for (const call of calls) {
      requireCondition(Object.hasOwn(toolSchemas, call.name), "FORBIDDEN");
      const name = call.name as ToolName;
      const output = await runTool(
        userId,
        runId,
        name,
        JSON.parse(call.arguments),
      );
      collectAgentOutput(outputs, name, output);
      steps.push(name);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }
    if (outputs.respond && !(outputs.respond as { failed?: boolean }).failed)
      return structuredAgentResult(outputs, steps);
  }
  throw new Error("AI tool round limit reached");
}
