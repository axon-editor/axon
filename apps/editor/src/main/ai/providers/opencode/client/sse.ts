/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type OpenCodeEvent } from "./types";

function parseBlock(block: string): OpenCodeEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;

  try {
    return JSON.parse(data) as OpenCodeEvent;
  } catch {
    // A malformed frame is safer to drop than to turn into a renderer error.
    // The run still finishes because the next heartbeat or terminal event is
    // independent of this frame.
    return null;
  }
}

// OpenCode's event stream is standard SSE: comment heartbeats, optional event
// names, and blank-line frame boundaries. The parser is intentionally separate
// from the NDJSON parser axon-core uses because mixing the two would silently
// accept partial JSON across frame boundaries.
export async function* readOpenCodeEvents(
  response: Response,
): AsyncGenerator<OpenCodeEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseBlock(block);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }

    const trailing = parseBlock(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}
