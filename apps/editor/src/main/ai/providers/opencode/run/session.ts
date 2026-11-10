/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import os from "node:os";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiUiToolResult,
} from "../../../../../shared/ai/ai";
import {
  createOpenCodeClient,
  type OpenCodeClient,
} from "../client/api";
import { readOpenCodeEvents } from "../client/sse";
import {
  type OpenCodePermissionDecision,
  type OpenCodePermissionRequest,
  type OpenCodeSessionModel,
} from "../client/types";
import { ensureOpenCodeServer } from "../server/lifecycle";
import { handleOpenCodeEvent } from "./events";

const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 500;
const MAX_HISTORY_MESSAGES = 20;

interface OpenCodeRun {
  requestId: string;
  client: OpenCodeClient | null;
  controller: AbortController;
  done: boolean;
  sessionID: string;
  send: (event: AiChatStreamEvent) => void;
  toolInputs: Map<string, Record<string, unknown>>;
  toolNames: Map<string, string>;
  permissionsByTool: Map<string, string>;
}

const runs = new Map<string, OpenCodeRun>();
const pendingPermissions = new Map<string, { run: OpenCodeRun; requestID: string }>();
const conversationSessions = new Map<string, string>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function conversationKey(folderPath: string | null, conversationId?: string) {
  if (!conversationId) return null;
  return `${folderPath ?? ""}::${conversationId}`;
}

function parseModel(request: AiChatRequest): OpenCodeSessionModel {
  if (request.providerID && request.modelID) {
    return { providerID: request.providerID, id: request.modelID };
  }

  const model = request.model?.trim() ?? "";
  const separator = model.indexOf("/");
  if (separator > 0) {
    return {
      providerID: model.slice(0, separator),
      id: model.slice(separator + 1),
    };
  }

  throw new Error("An OpenCode model is required for this request.");
}

function buildPrompt(request: AiChatRequest, includeHistory: boolean) {
  const contextLines: string[] = [];
  if (request.activeFilePath) {
    contextLines.push(`Active file: ${request.activeFilePath}`);
  }
  if (request.diagnostics.length > 0) {
    contextLines.push(`Diagnostics: ${request.diagnostics.length} problems`);
  }
  if (request.files.length > 0) {
    contextLines.push(
      `Context files: ${request.files.map((file) => file.path).join(", ")}`,
    );
  }

  let prompt = request.prompt;
  if (contextLines.length > 0) {
    prompt = `[Axon context]\n${contextLines.join("\n")}\n\n${prompt}`;
  }

  // OpenCode keeps history server-side, so only a brand-new session needs the
  // restored Axon transcript. Sending it on every turn would duplicate context.
  if (includeHistory && request.conversation.length > 0) {
    const history = request.conversation
      .slice(-MAX_HISTORY_MESSAGES)
      .map(
        (message) =>
          `${message.role === "user" ? "User" : "Assistant"}: ${message.content.slice(0, 4_000)}`,
      )
      .join("\n\n");
    prompt = `[Prior conversation]\n${history}\n\n[Current request]\n${prompt}`;
  }

  return prompt;
}

async function resolveSession(
  run: OpenCodeRun,
  request: AiChatRequest,
  model: OpenCodeSessionModel,
) {
  const client = run.client;
  if (!client) throw new Error("OpenCode client is not ready.");

  const key = conversationKey(request.folderPath, request.conversationId);
  const persistedSessionID = request.backendSessionId?.trim();
  if (persistedSessionID) {
    try {
      await client.setModel(persistedSessionID, model);
      if (key) conversationSessions.set(key, persistedSessionID);
      return { sessionID: persistedSessionID, isNew: false };
    } catch {
      // The persisted id can outlive the OpenCode session if the user cleared
      // OpenCode's data. Fall through so the next attempt creates a new one.
      if (key) conversationSessions.delete(key);
    }
  }

  const existingSessionID = key ? conversationSessions.get(key) : undefined;
  if (existingSessionID) {
    try {
      await client.setModel(existingSessionID, model);
      return { sessionID: existingSessionID, isNew: false };
    } catch {
      // A server restart or a conversation deleted outside Axon invalidates the
      // cached id. Fall through and create a fresh session rather than failing
      // the request outright.
      if (key) conversationSessions.delete(key);
    }
  }

  const session = await client.createSession({
    directory: request.folderPath ?? os.homedir(),
    model,
    title: request.prompt.slice(0, 60) || "Axon conversation",
  });
  if (key) conversationSessions.set(key, session.id);
  return { sessionID: session.id, isNew: true };
}

function finishRun(run: OpenCodeRun, sendDone: boolean) {
  if (run.done) return;
  run.done = true;
  runs.delete(run.requestId);
  for (const toolID of run.permissionsByTool.keys()) {
    pendingPermissions.delete(toolID);
  }
  run.permissionsByTool.clear();
  run.toolInputs.clear();
  run.toolNames.clear();
  run.controller.abort();
  if (sendDone) {
    run.send({
      requestId: run.requestId,
      type: "done",
      done: true,
    });
  }
}

async function consumeEvents(run: OpenCodeRun, onReady: () => void) {
  let ready = onReady;
  let attempts = 0;

  while (!run.done && attempts < RECONNECT_ATTEMPTS) {
    try {
      const client = run.client;
      if (!client) throw new Error("OpenCode client is not ready.");
      const response = await client.events(run.controller.signal);
      if (!response.ok) {
        throw new Error(
          `OpenCode event stream returned ${response.status}.`,
        );
      }
      ready();
      ready = () => {};

      for await (const event of readOpenCodeEvents(response)) {
        if (run.done) break;
        handleOpenCodeEvent(event, {
          requestId: run.requestId,
          sessionID: run.sessionID,
          send: run.send,
          toolInputs: run.toolInputs,
          toolNames: run.toolNames,
          onDone: () => finishRun(run, true),
          onPermission: (
            permission: OpenCodePermissionRequest,
            toolID: string,
          ) => {
            pendingPermissions.set(toolID, {
              run,
              requestID: permission.id,
            });
            run.permissionsByTool.set(toolID, permission.id);
          },
        });
      }

      if (run.done) return;
      // The event bus is long-lived. A normal close before a terminal event is
      // a disconnect, not a completed run, so it consumes a reconnect attempt.
      attempts += 1;
      if (attempts >= RECONNECT_ATTEMPTS) {
        run.send({
          requestId: run.requestId,
          type: "error",
          error: "OpenCode event stream disconnected.",
        });
        finishRun(run, false);
        return;
      }
      await delay(RECONNECT_DELAY_MS * attempts);
    } catch (error) {
      if (run.controller.signal.aborted || run.done) return;
      attempts += 1;
      if (attempts >= RECONNECT_ATTEMPTS) {
        run.send({
          requestId: run.requestId,
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "OpenCode event stream disconnected.",
        });
        finishRun(run, false);
        return;
      }
      await delay(RECONNECT_DELAY_MS * attempts);
    }
  }
}

export async function startOpenCodeRun(input: {
  requestId: string;
  request: AiChatRequest;
  send: (event: AiChatStreamEvent) => void;
}) {
  const { requestId, request, send } = input;
  const run: OpenCodeRun = {
    requestId,
    client: null,
    controller: new AbortController(),
    done: false,
    sessionID: "",
    send,
    toolInputs: new Map(),
    toolNames: new Map(),
    permissionsByTool: new Map(),
  };
  runs.set(requestId, run);

  try {
    // Let the IPC invoke response reach the renderer before any synchronous
    // validation error can be emitted on the event channel.
    await delay(0);
    const model = parseModel(request);
    const server = await ensureOpenCodeServer(
      request.folderPath ?? os.homedir(),
    );
    if (run.done) return;
    run.client = createOpenCodeClient(server);

    const { sessionID, isNew } = await resolveSession(run, request, model);
    if (run.done) return;
    run.sessionID = sessionID;

    let markReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    void consumeEvents(run, markReady);
    // Do not let a slow event stream hold the prompt forever. The event bus is
    // local, so one second is generous; if it is not ready by then, the prompt
    // still needs to reach OpenCode and the reconnect loop can catch up.
    await Promise.race([ready, delay(1_000)]);
    if (run.done) return;

    // The renderer only starts accepting events after the invoke response
    // returns the request id. Sending these after the server, session, and
    // event subscription are ready keeps them from being dropped by that
    // handshake.
    send({ requestId, type: "session", sessionId: sessionID });
    send({ requestId, type: "status", status: "Thinking..." });
    await run.client.prompt(
      sessionID,
      buildPrompt(request, isNew),
    );
  } catch (error) {
    if (!run.done) {
      send({
        requestId,
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "OpenCode could not start this request.",
      });
      finishRun(run, false);
    }
  }
}

export function cancelOpenCodeRun(requestId: string): boolean {
  const run = runs.get(requestId);
  if (!run) return false;

  if (run.client && run.sessionID) {
    void run.client.interrupt(run.sessionID).catch(() => {});
  }
  run.send({
    requestId,
    type: "cancelled",
    error: "Request cancelled.",
  });
  finishRun(run, false);
  return true;
}

export function resolveOpenCodePermission(result: AiUiToolResult): boolean {
  const permission = pendingPermissions.get(result.callId);
  if (!permission) return false;

  pendingPermissions.delete(result.callId);
  permission.run.permissionsByTool.delete(result.callId);

  const decision: OpenCodePermissionDecision =
    result.rejected || !result.ok
      ? "reject"
      : result.allowForSession
        ? "always"
        : "once";
  const client = permission.run.client;
  if (client) {
    void client
      .replyPermission(
        permission.run.sessionID,
        permission.requestID,
        decision,
        result.message,
      )
      .catch(() => {});
  }
  return true;
}
