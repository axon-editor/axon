/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "crypto";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiChatStreamStarted,
  type AiPullEvent,
  type AiPullStarted,
} from "../../../shared/ai/ai";
import {
  type CoreStreamEvent,
  readCoreStreamEvents,
} from "./coreStreamProtocol";

const pullControllers = new Map<string, AbortController>();
const chatControllers = new Map<string, AbortController>();

function toChatStreamEvent(
  event: CoreStreamEvent,
): Omit<AiChatStreamEvent, "requestId"> {
  if (event.type === "delta") {
    return { type: "delta", delta: event.delta };
  }
  if (event.type === "thought") {
    return { type: "thought", thought: event.thought };
  }
  if (event.type === "status") {
    return { type: "status", status: event.status };
  }
  if (event.type === "done") {
    return { type: "done", done: true };
  }
  return {
    type: "error",
    error: event.error ?? "Axon Agent stream failed.",
  };
}

export function startCoreAiStream(input: {
  axonCorePort: string;
  axonCoreToken: string;
  request: AiChatRequest;
  send: (event: AiChatStreamEvent) => void;
  requestId?: string;
}): AiChatStreamStarted {
  // The agent loop streams its final answer under the same request id it has
  // been emitting status and tool events on, so the renderer sees one logical
  // request from first status to last token.
  const requestId = input.requestId ?? randomUUID();
  const controller = new AbortController();
  chatControllers.set(requestId, controller);

  void (async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${input.axonCorePort}/ai/chat/stream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.axonCoreToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.request),
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`axon-core returned ${response.status}`);
      }

      await readCoreStreamEvents(response.body, (event) => {
        input.send({ requestId, ...toChatStreamEvent(event) });
      });
      input.send({ requestId, type: "done", done: true });
    } catch (err) {
      const cancelled = err instanceof Error && err.name === "AbortError";
      input.send({
        requestId,
        type: cancelled ? "cancelled" : "error",
        error: cancelled
          ? "Request cancelled."
          : err instanceof Error
            ? err.message
            : "Axon Agent stream failed.",
      });
    } finally {
      chatControllers.delete(requestId);
    }
  })();

  return { success: true, requestId };
}

export function cancelCoreAiStream(requestId: string) {
  const controller = chatControllers.get(requestId);
  if (!controller) return false;
  controller.abort();
  chatControllers.delete(requestId);
  return true;
}

export function startCoreModelPullStream(input: {
  axonCorePort: string;
  axonCoreToken: string;
  model: string;
  send: (event: AiPullEvent) => void;
}): AiPullStarted {
  const requestId = randomUUID();
  const controller = new AbortController();
  pullControllers.set(requestId, controller);

  void (async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${input.axonCorePort}/ai/models/pull/stream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.axonCoreToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: input.model }),
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`axon-core returned ${response.status}`);
      }

      await readCoreStreamEvents(response.body, (event) => {
        input.send({
          requestId,
          type: event.type as AiPullEvent["type"],
          status: event.status,
          model: event.model ?? input.model,
          completed: event.completed,
          total: event.total,
          error: event.error,
          done: event.done,
        });
      });
      input.send({ requestId, type: "done", model: input.model, done: true });
    } catch (err) {
      const cancelled = err instanceof Error && err.name === "AbortError";
      input.send({
        requestId,
        type: cancelled ? "cancelled" : "error",
        model: input.model,
        error: cancelled
          ? "Model download cancelled."
          : err instanceof Error
            ? err.message
            : "Axon model download failed.",
      });
    } finally {
      pullControllers.delete(requestId);
    }
  })();

  return { success: true, requestId };
}

export function cancelCoreModelPull(requestId: string) {
  const controller = pullControllers.get(requestId);
  if (!controller) return false;
  controller.abort();
  pullControllers.delete(requestId);
  return true;
}
