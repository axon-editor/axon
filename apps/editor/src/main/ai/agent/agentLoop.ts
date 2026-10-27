/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "crypto";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiModelToolCall,
  type AiToolCall,
} from "../../../shared/ai/ai";
import {
  AI_UI_TOOL_SPECS,
  aiUiToolDefinition,
  aiUiToolSpec,
} from "../../../shared/ai/uiTools";
import {
  aiEditorToolDefinitions,
  aiEditorToolSpec,
  runEditorTool,
} from "../../../shared/ai/editorTools";
import { type EditorDiagnostic } from "../../../shared/editor/language/diagnostics";
import { getToolDefinitions, planTurn, runTool } from "./coreClient";
import { cancelCoreAiStream, startCoreAiStream } from "../streaming/coreStream";
import { proposeUiTool, rejectUiToolsForRequest } from "./uiToolBridge";

const MAX_TOOL_ROUNDS = 4;

// The tool card shows a preview of what the agent saw, but the model still gets
// the full output. Truncating here keeps large file reads and problem lists from
// bloating the IPC payload without cutting the data the answer depends on.
const TOOL_PREVIEW_LIMIT = 2000;

function toolPreview(result: string) {
  if (result.length <= TOOL_PREVIEW_LIMIT) return result;
  return `${result.slice(0, TOOL_PREVIEW_LIMIT)}\n\n[truncated ${result.length - TOOL_PREVIEW_LIMIT} chars]`;
}

interface CoreEndpoint {
  axonCorePort: string;
  axonCoreToken: string;
}

// The loop is fire-and-forget from the IPC handler's point of view, so the run
// map keeps the abort controller reachable by request id for cancellation.
const runs = new Map<string, AbortController>();

export function cancelAgentRun(requestId: string): boolean {
  rejectUiToolsForRequest(requestId);
  const cancelledStream = cancelCoreAiStream(requestId);
  const controller = runs.get(requestId);
  if (!controller) return cancelledStream;
  controller.abort();
  runs.delete(requestId);
  return true;
}

function parseArguments(
  value: AiModelToolCall["function"]["arguments"] | undefined,
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value;
}

function uiResultText(
  result: { ok: boolean; rejected?: boolean; message?: string },
  name: string,
) {
  if (result.ok) {
    return `Executed ${name}.${result.message ? ` ${result.message}` : ""}`;
  }
  if (result.rejected) {
    return `The user declined to run ${name}.`;
  }
  return `Running ${name} failed: ${result.message ?? "unknown error"}`;
}

// The renderer orders status lines, tool cards, and text by the sequence they
// arrive in, so a tool's start and finish need their own status events. Waiting
// until the next planning round made the UI look like the tool ran before the
// agent had even started it.
function toolStartStatus(title: string, waitsForUser: boolean) {
  return waitsForUser ? `Waiting for you to run ${title}...` : `Running ${title}...`;
}

function toolFinishStatus(
  title: string,
  result: { ok: boolean; rejected?: boolean },
) {
  if (result.rejected) return `Skipped ${title}.`;
  return result.ok ? `Finished ${title}.` : `${title} failed.`;
}

export function runAgentLoop(input: {
  axonCorePort: string;
  axonCoreToken: string;
  request: AiChatRequest;
  send: (event: AiChatStreamEvent) => void;
}): { requestId: string } {
  const requestId = randomUUID();
  const controller = new AbortController();
  runs.set(requestId, controller);

  void runLoop({
    requestId,
    core: {
      axonCorePort: input.axonCorePort,
      axonCoreToken: input.axonCoreToken,
    },
    request: input.request,
    send: input.send,
    signal: controller.signal,
  }).finally(() => {
    runs.delete(requestId);
  });

  return { requestId };
}

async function runLoop(input: {
  requestId: string;
  core: CoreEndpoint;
  request: AiChatRequest;
  send: (event: AiChatStreamEvent) => void;
  signal: AbortSignal;
}) {
  const { requestId, core, request, send, signal } = input;
  try {
    const coreDefinitions = await getToolDefinitions(core, signal).catch(
      () => [],
    );
    const workspaceTools = new Set(
      coreDefinitions.map((definition) => definition.function.name),
    );
    const tools = [
      ...coreDefinitions,
      ...AI_UI_TOOL_SPECS.map(aiUiToolDefinition),
      ...aiEditorToolDefinitions(),
    ];

    let messages = request.messages ? [...request.messages] : [];
    let reachedToolLimit = true;
    let finalContent = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (round === 0) {
        send({ requestId, type: "status", status: "Thinking..." });
      }

      const turn = await planTurn(
        core,
        { ...request, messages, tools },
        signal,
      );
      messages = turn.messages;

      const toolCalls = turn.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        reachedToolLimit = false;
        finalContent = turn.message.content ?? "";
        break;
      }

      // The planning turn often explains what it is about to do before asking
      // for a tool. Sending it as a thought keeps that explanation in a
      // collapsible block above the tool card instead of mixing it into the
      // final answer text.
      const planningContent = turn.message.content ?? "";
      if (planningContent.trim()) {
        send({ requestId, type: "thought", thought: planningContent });
      }

      messages.push({
        role: "assistant",
        content: planningContent,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        messages.push({
          role: "tool",
          content: await executeToolCall({
            call,
            core,
            folderPath: request.folderPath,
            diagnostics: request.diagnostics,
            requestId,
            send,
            signal,
            workspaceTools,
          }),
        });
      }

      send({
        requestId,
        type: "status",
        status: "Reviewing tool results...",
      });
    }

    // The planning turn already produced the final answer. Re-running the same
    // conversation through /ai/chat/stream made every prompt wait for the model
    // twice, and the second wait was the one users saw before the first token.
    if (finalContent.trim()) {
      send({ requestId, type: "delta", delta: finalContent });
      send({ requestId, type: "done", done: true });
      return;
    }

    if (reachedToolLimit) {
      messages.push({
        role: "tool",
        content:
          "Tool limit reached. Answer with the information already gathered.",
      });
    }

    await startCoreAiStream({
      axonCorePort: core.axonCorePort,
      axonCoreToken: core.axonCoreToken,
      requestId,
      request: { ...request, messages, tools: undefined },
      send,
    });
  } catch (err) {
    const cancelled =
      signal.aborted || (err instanceof Error && err.name === "AbortError");
    send({
      requestId,
      type: cancelled ? "cancelled" : "error",
      error: cancelled
        ? "Request cancelled."
        : err instanceof Error
          ? err.message
          : "Axon Agent stream failed.",
    });
  }
}

async function executeToolCall(input: {
  call: AiModelToolCall;
  core: CoreEndpoint;
  folderPath: string | null;
  diagnostics: EditorDiagnostic[];
  requestId: string;
  send: (event: AiChatStreamEvent) => void;
  signal: AbortSignal;
  workspaceTools: Set<string>;
}): Promise<string> {
  const { call, core, folderPath, diagnostics, requestId, send, signal, workspaceTools } =
    input;
  const name = call.function.name;
  const args = parseArguments(call.function.arguments);
  const id = randomUUID();
  const spec = aiUiToolSpec(name);

  if (spec) {
    const tool: AiToolCall = {
      id,
      name,
      kind: "ui",
      title: spec.title,
      arguments: args,
    };
    send({
      requestId,
      type: "status",
      status: toolStartStatus(spec.title, true),
    });
    const result = await proposeUiTool(requestId, tool, send);
    send({
      requestId,
      type: "tool-result",
      tool,
      toolResult: result,
    });
    send({
      requestId,
      type: "status",
      status: toolFinishStatus(spec.title, result),
    });
    return uiResultText(result, name);
  }

  const editorSpec = aiEditorToolSpec(name);
  if (editorSpec) {
    const tool: AiToolCall = {
      id,
      name,
      kind: "editor",
      title: editorSpec.title,
      arguments: args,
    };
    send({
      requestId,
      type: "status",
      status: toolStartStatus(editorSpec.title, false),
    });
    send({ requestId, type: "tool-started", tool });
    const result = runEditorTool(name, args, diagnostics);
    send({
      requestId,
      type: "tool-result",
      tool,
      toolResult: { callId: id, ok: true, result: toolPreview(result) },
    });
    send({
      requestId,
      type: "status",
      status: toolFinishStatus(editorSpec.title, { ok: true }),
    });
    return result;
  }

  if (!workspaceTools.has(name) || !folderPath) {
    send({
      requestId,
      type: "status",
      status: `Skipped ${name}: tool is not available.`,
    });
    return `Tool ${name} is not available.`;
  }

  const tool: AiToolCall = {
    id,
    name,
    kind: "workspace",
    title: name,
    arguments: args,
  };
  send({
    requestId,
    type: "status",
    status: toolStartStatus(name, false),
  });
  send({ requestId, type: "tool-started", tool });
  try {
    const result = await runTool(
      core,
      { folderPath, name, arguments: args },
      signal,
    );
    send({
      requestId,
      type: "tool-result",
      tool,
      toolResult: { callId: id, ok: true, result: toolPreview(result) },
    });
    send({
      requestId,
      type: "status",
      status: toolFinishStatus(name, { ok: true }),
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    send({
      requestId,
      type: "tool-result",
      tool,
      toolResult: { callId: id, ok: false, message },
    });
    send({
      requestId,
      type: "status",
      status: toolFinishStatus(name, { ok: false }),
    });
    return `Running ${name} failed: ${message}`;
  }
}
