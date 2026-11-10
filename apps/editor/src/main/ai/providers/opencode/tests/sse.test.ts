/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readOpenCodeEvents } from "../client/sse";

function responseFrom(text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
  );
}

describe("readOpenCodeEvents", () => {
  it("parses data frames and ignores heartbeat comments", async () => {
    const events = [];
    for await (const event of readOpenCodeEvents(
      responseFrom(
        ': heartbeat\n\ndata: {"type":"session.text.delta","data":{"delta":"hi"}}\n\n',
      ),
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "session.text.delta", data: { delta: "hi" } },
    ]);
  });

  it("handles CRLF frames and multi-line data", async () => {
    const events = [];
    for await (const event of readOpenCodeEvents(
      responseFrom('data: {"type":"a",\r\ndata: "data":{"value":1}}\r\n\r\n'),
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "a", data: { value: 1 } }]);
  });
});
