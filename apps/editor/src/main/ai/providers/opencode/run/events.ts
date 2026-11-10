/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiChatStreamEvent } from "../../../../../shared/ai/ai";
import {
  type OpenCodeEvent,
  type OpenCodePermissionRequest,
} from "../client/types";
import {
  createToolCall,
  permissionArguments,
  toolResultText,
} from "./toolCall";

export interface OpenCodeEventContext {
  requestId: string;
  sessionID: string;
  send: (event: AiChatStreamEvent) => void;
  toolInputs: Map<string, Record<string, unknown>>;
  toolNames: Map<string, string>;
  onDone: () => void;
  onPermission: (
    permission: OpenCodePermissionRequest,
    toolID: string,
  ) => void;
}

// OpenCode streams the whole server's event bus. Filtering here by the root
// session keeps a subagent's tool calls from appearing as if the main agent
// ran them. Text and reasoning use deltas only; the matching part.updated and
// *.ended events would duplicate the transcript.
export function handleOpenCodeEvent(
  event: OpenCodeEvent,
  context: OpenCodeEventContext,
) {
  const data = event.data ?? {};
  const eventSessionID =
    typeof data.sessionID === "string" ? data.sessionID : undefined;
  if (eventSessionID && eventSessionID !== context.sessionID) return;

  if (event.type === "session.reasoning.delta") {
    const thought = data.delta;
    if (typeof thought === "string" && thought) {
      context.send({
        requestId: context.requestId,
        type: "thought",
        thought,
      });
    }
    return;
  }

  if (event.type === "session.text.delta") {
    const delta = data.delta;
    if (typeof delta === "string" && delta) {
      context.send({ requestId: context.requestId, type: "delta", delta });
    }
    return;
  }

  if (event.type === "session.tool.input.started") {
    if (typeof data.id === "string" && typeof data.name === "string") {
      context.toolNames.set(data.id, data.name);
    }
    return;
  }

  if (event.type === "session.tool.called") {
    if (typeof data.id !== "string") return;
    const name =
      context.toolNames.get(data.id) ??
      (typeof data.name === "string" ? data.name : "tool");
    const input =
      data.input && typeof data.input === "object"
        ? (data.input as Record<string, unknown>)
        : {};
    context.toolInputs.set(data.id, input);
    context.send({
      requestId: context.requestId,
      type: "tool-started",
      tool: createToolCall(data.id, name, input),
    });
    return;
  }

  if (event.type === "permission.asked") {
    const permission = data as unknown as OpenCodePermissionRequest;
    if (
      typeof permission.id !== "string" ||
      typeof permission.action !== "string" ||
      !Array.isArray(permission.resources)
    ) {
      return;
    }

    const toolID = permission.source?.id ?? permission.id;
    const name = context.toolNames.get(toolID) ?? permission.action;
    context.onPermission(permission, toolID);
    context.send({
      requestId: context.requestId,
      type: "tool-proposed",
      tool: createToolCall(
        toolID,
        name,
        permissionArguments(permission),
        true,
      ),
    });
    return;
  }

  if (
    event.type === "session.tool.success" ||
    event.type === "session.tool.failed"
  ) {
    if (typeof data.id !== "string") return;
    const ok = event.type === "session.tool.success";
    const name = context.toolNames.get(data.id) ?? "tool";
    const result = toolResultText(data);
    context.send({
      requestId: context.requestId,
      type: "tool-result",
      tool: createToolCall(
        data.id,
        name,
        context.toolInputs.get(data.id) ?? {},
      ),
      toolResult: {
        callId: data.id,
        ok,
        ...(ok ? { result } : { message: result || "OpenCode tool failed." }),
      },
    });
    return;
  }

  if (event.type === "session.status") {
    const status = data.status;
    if (status === "busy") {
      context.send({
        requestId: context.requestId,
        type: "status",
        status: "Working...",
      });
    } else if (status === "retry") {
      context.send({
        requestId: context.requestId,
        type: "status",
        status: "Retrying...",
      });
    }
    return;
  }

  if (event.type === "session.step.started") {
    context.send({
      requestId: context.requestId,
      type: "status",
      status: "Thinking...",
    });
    return;
  }

  if (event.type === "session.retry.scheduled") {
    context.send({
      requestId: context.requestId,
      type: "status",
      status: "Retrying...",
    });
    return;
  }

  if (event.type === "session.compaction.started") {
    context.send({
      requestId: context.requestId,
      type: "status",
      status: "Compacting context...",
    });
    return;
  }

  if (event.type === "session.execution.succeeded") {
    context.onDone();
    return;
  }

  if (event.type === "session.execution.interrupted") {
    context.send({
      requestId: context.requestId,
      type: "cancelled",
      error: "OpenCode run was interrupted.",
    });
    context.onDone();
    return;
  }

  if (
    event.type === "session.execution.failed" ||
    event.type === "session.error"
  ) {
    const message =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "OpenCode run failed.";
    context.send({
      requestId: context.requestId,
      type: "error",
      error: message,
    });
    context.onDone();
  }
}
