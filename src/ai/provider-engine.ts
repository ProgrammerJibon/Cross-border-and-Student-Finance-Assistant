import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { toolSchemas, runTool, type ToolName } from "./tools";
import {
  agentInstructions,
  collectAgentOutput,
  structuredAgentResult,
} from "./structured-response";
import { providerRequest } from "./provider-transport";
import type {
  ChatMessage,
  ProviderConfig,
  ProviderUsage,
} from "./provider-config";
import { canUseAgentTool } from "./tool-policy";

type Call = { id: string; name: string; args: unknown };
type Json = Record<string, unknown>;
export function providerTools() {
  return Object.entries(toolSchemas).map(([name, schema]) => {
    const json = z.toJSONSchema(schema) as Json;
    delete json.$schema;
    return {
      name,
      description:
        name === "requestAction"
          ? "Prepare an action for explicit user review. First call getActionCapabilities to obtain the authorized action input schema. Encode input_json as JSON; monetary amounts are strings and currency is required. Correct validation errors using the returned schema; never claim execution."
          : `Application tool ${name}. Reads are scoped to the authenticated user. Mutations only prepare a review; never invent IDs or confirmation. Finish with respond.`,
      parameters: json,
    };
  });
}
export async function providerAgent(
  userId: string,
  runId: string,
  messages: ChatMessage[],
  locale: string,
  config: ProviderConfig,
  execute: typeof runTool = runTool,
) {
  const definitions = providerTools().filter(
    (t) => !config.role || canUseAgentTool(config.role, t.name),
  );
  const instructions = `${agentInstructions} Respond in ${locale}.`;
  const outputs: Record<string, unknown> = {};
  const steps: string[] = [];
  const toolCalls: { name: string; status: string }[] = [];
  const usage: ProviderUsage[] = [];
  const input: unknown[] = messages.map((m) => ({ ...m }));
  const contents: unknown[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const chat: unknown[] = messages.map((m) => ({ ...m }));
  let correction = false;
  for (let round = 0; round < 12; round++) {
    let request: unknown;
    if (config.company === "OPENAI")
      request = {
        model: config.model,
        instructions,
        input,
        store: false,
        max_output_tokens: 4096,
        parallel_tool_calls: false,
        tool_choice: "required",
        tools: definitions.map((t) => ({
          type: "function",
          ...t,
          strict: true,
        })),
      };
    else if (config.company === "GEMINI")
      request = {
        contents,
        systemInstruction: { parts: [{ text: instructions }] },
        tools: [
          {
            functionDeclarations: definitions.map(
              ({ name, description, parameters }) => ({
                name,
                description,
                parametersJsonSchema: parameters,
              }),
            ),
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        generationConfig: { maxOutputTokens: 4096 },
      };
    else if (config.company === "ANTHROPIC")
      request = {
        model: config.model,
        system: instructions,
        messages: chat,
        max_tokens: 4096,
        tool_choice: { type: "any", disable_parallel_tool_use: true },
        tools: definitions.map(({ name, description, parameters }) => ({
          name,
          description,
          input_schema: parameters,
        })),
      };
    else
      request = {
        model: config.model,
        messages: [{ role: "system", content: instructions }, ...chat],
        max_tokens: 4096,
        tool_choice: "required",
        tools: definitions.map((t) => ({ type: "function", function: t })),
      };
    const response = await providerRequest(config, request);
    usage.push(response.usage);
    const body = response.body;
    const calls: Call[] = [];
    let text = "";
    if (config.company === "OPENAI") {
      if (body.status === "incomplete") throw new AppError("AI_OUTPUT_LIMIT");
      for (const item of body.output || []) {
        input.push(item);
        if (item.type === "function_call")
          calls.push({
            id: item.call_id,
            name: item.name,
            args: item.arguments,
          });
        if (item.type === "message")
          text += (item.content || [])
            .map((p: { text?: string }) => p.text || "")
            .join("\n");
      }
    } else if (config.company === "GEMINI") {
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS")
        throw new AppError("AI_OUTPUT_LIMIT");
      if (!candidate?.content?.parts?.length)
        throw new AppError("AI_INVALID_RESPONSE");
      contents.push(candidate.content); // Preserve thought signatures verbatim.
      for (const part of candidate.content.parts) {
        if (part.functionCall)
          calls.push({
            id: part.functionCall.id || "",
            name: part.functionCall.name,
            args: part.functionCall.args,
          });
        if (part.text && !part.thought) text += part.text;
      }
    } else if (config.company === "ANTHROPIC") {
      if (body.stop_reason === "max_tokens")
        throw new AppError("AI_OUTPUT_LIMIT");
      if (!Array.isArray(body.content))
        throw new AppError("AI_INVALID_RESPONSE");
      chat.push({ role: "assistant", content: body.content });
      for (const block of body.content) {
        if (block.type === "tool_use")
          calls.push({ id: block.id, name: block.name, args: block.input });
        if (block.type === "text") text += block.text;
      }
    } else {
      const choice = body.choices?.[0];
      if (choice?.finish_reason === "length")
        throw new AppError("AI_OUTPUT_LIMIT");
      if (!choice?.message) throw new AppError("AI_INVALID_RESPONSE");
      chat.push(choice.message);
      text = choice.message.content || "";
      for (const call of choice.message.tool_calls || [])
        calls.push({
          id: call.id,
          name: call.function.name,
          args: call.function.arguments,
        });
    }
    if (!calls.length) {
      // Text alone is not an executable/validated response. Give the provider one
      // repair turn; never present unvalidated claims of financial completion.
      if (correction || !text) throw new AppError("AI_INVALID_RESPONSE");
      correction = true;
      const repair = {
        role: "user",
        content:
          "Return your answer with the respond tool and all its required fields. Do not execute or repeat earlier actions.",
      };
      input.push(repair);
      chat.push(repair);
      contents.push({ role: "user", parts: [{ text: repair.content }] });
      continue;
    }
    if (calls.length > 20) throw new AppError("AI_INVALID_RESPONSE");
    const toolResults: unknown[] = [];
    let finished = false;
    for (const call of calls) {
      let output: unknown;
      if (!Object.hasOwn(toolSchemas, call.name))
        output = { failed: true, code: "FORBIDDEN" };
      else {
        let args = call.args;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = null;
          }
        }
        output = await execute(userId, runId, call.name as ToolName, args);
        collectAgentOutput(outputs, call.name, output);
        steps.push(call.name);
        toolCalls.push({
          name: call.name,
          status: (output as { failed?: boolean })?.failed
            ? "FAILED"
            : "SUCCESS",
        });
        if (
          call.name === "respond" &&
          !(output as { failed?: boolean })?.failed
        )
          finished = true;
      }
      if (config.company === "OPENAI")
        input.push({
          type: "function_call_output",
          call_id: call.id,
          output: JSON.stringify(output),
        });
      else if (config.company === "GEMINI")
        toolResults.push({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: { result: output },
          },
        });
      else if (config.company === "ANTHROPIC")
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(output),
          is_error: Boolean((output as { failed?: boolean })?.failed),
        });
      else
        chat.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
    }
    if (finished)
      return { ...structuredAgentResult(outputs, steps), toolCalls, usage };
    if (config.company === "GEMINI")
      contents.push({ role: "user", parts: toolResults });
    if (config.company === "ANTHROPIC")
      chat.push({ role: "user", content: toolResults });
  }
  throw new AppError("AI_STEP_LIMIT");
}
