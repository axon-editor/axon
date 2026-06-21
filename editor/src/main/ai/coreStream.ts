import { randomUUID } from "crypto";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiChatStreamStarted,
  type AiPullEvent,
  type AiPullStarted,
} from "../../shared/ai";

const pullControllers = new Map<string, AbortController>();
const chatControllers = new Map<string, AbortController>();

interface CoreStreamEvent {
  type: string;
  delta?: string;
  status?: string;
  model?: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
}

interface CoreStreamEnvelope {
  status: "success" | "error";
  http_status: number;
  message: string;
  data?: CoreStreamEvent;
  errors?: Record<string, string[]> | null;
  code?: string | null;
  request_id: string;
  meta?: unknown;
}

function parseCoreStreamLine(line: string): CoreStreamEvent {
  const envelope = JSON.parse(line) as CoreStreamEnvelope;
  if (envelope.status === "error") {
    return {
      type: "error",
      error: envelope.message || "Axon Agent stream failed.",
    };
  }
  if (!envelope.data) {
    return {
      type: "error",
      error: "axon-core returned an empty AI stream event.",
    };
  }
  return envelope.data;
}

function toChatStreamEvent(event: CoreStreamEvent): Omit<AiChatStreamEvent, "requestId"> {
  if (event.type === "delta") {
    return { type: "delta", delta: event.delta };
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
  request: AiChatRequest;
  send: (event: AiChatStreamEvent) => void;
}): AiChatStreamStarted {
  const requestId = randomUUID();
  const controller = new AbortController();
  chatControllers.set(requestId, controller);

  void (async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${input.axonCorePort}/ai/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.request),
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`axon-core returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });

        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = parseCoreStreamLine(trimmed);
          input.send({ requestId, ...toChatStreamEvent(event) });
        }
      }

      if (pending.trim()) {
        const event = parseCoreStreamLine(pending.trim());
        input.send({ requestId, ...toChatStreamEvent(event) });
      }
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: input.model }),
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`axon-core returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });

        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = parseCoreStreamLine(trimmed);
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
        }
      }

      input.send({ requestId, type: "done", model: input.model, done: true });
    } catch (err) {
      const cancelled =
        err instanceof Error && err.name === "AbortError";
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
