/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AiModelMessage,
  type AiModelToolCall,
} from "../../../shared/ai/ai";

export interface CoreStreamEvent {
  type: string;
  delta?: string;
  thought?: string;
  status?: string;
  model?: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
  tool_calls?: AiModelToolCall[];
  messages?: AiModelMessage[];
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

export function parseCoreStreamLine(line: string): CoreStreamEvent {
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

export function parseCoreStreamLineSafely(
  line: string,
): CoreStreamEvent | null {
  try {
    return parseCoreStreamLine(line);
  } catch (err) {
    // A malformed NDJSON line should not kill a long-running chat stream after
    // useful tokens have already arrived. Proper error envelopes still flow
    // through parseCoreStreamLine; this catch only skips data that is not valid
    // stream JSON at all and leaves a bounded log sample for debugging.
    console.warn(
      "skipped malformed AI stream line:",
      line.slice(0, 500),
      err,
    );
    return null;
  }
}

export async function readCoreStreamEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: CoreStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
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
      const event = parseCoreStreamLineSafely(trimmed);
      if (event) onEvent(event);
    }
  }

  if (pending.trim()) {
    const event = parseCoreStreamLineSafely(pending.trim());
    if (event) onEvent(event);
  }
}
