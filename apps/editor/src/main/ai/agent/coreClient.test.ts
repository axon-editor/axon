/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { type AiChatRequest } from "../../../shared/ai/ai";
import { streamPlanTurn } from "./coreClient";

function streamResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n"));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

function streamEnvelope(data: unknown) {
  return JSON.stringify({
    status: "success",
    http_status: 200,
    message: "AI stream event.",
    data,
    errors: null,
    code: null,
    request_id: "request-id",
    meta: null,
  });
}

const request: AiChatRequest = {
  action: "agent",
  prompt: "list the root",
  folderPath: "/workspace",
  activeFilePath: null,
  files: [],
  diagnostics: [],
  gitChanges: [],
  conversation: [],
};

describe("streamPlanTurn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams thoughts and returns buffered content, tool calls, and messages", async () => {
    const builtMessages = [
      { role: "system" as const, content: "system prompt" },
      { role: "user" as const, content: "list the root" },
    ];
    const toolCalls = [
      {
        function: {
          name: "list_files",
          arguments: { path: "" },
        },
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        streamEnvelope({ type: "status", status: "Streaming response..." }),
        streamEnvelope({ type: "thought", thought: "I should inspect " }),
        streamEnvelope({ type: "thought", thought: "the root first." }),
        streamEnvelope({ type: "delta", delta: "I'll list " }),
        streamEnvelope({ type: "delta", delta: "the root." }),
        streamEnvelope({
          type: "done",
          done: true,
          tool_calls: toolCalls,
          messages: builtMessages,
        }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const thoughts: string[] = [];
    const result = await streamPlanTurn(
      { axonCorePort: "17777", axonCoreToken: "token" },
      request,
      new AbortController().signal,
      (thought) => thoughts.push(thought),
    );

    expect(thoughts).toEqual(["I should inspect ", "the root first."]);
    expect(result.message.content).toBe("I'll list the root.");
    expect(result.message.tool_calls).toEqual(toolCalls);
    expect(result.messages).toEqual(builtMessages);
  });

  it("throws when the stream reports an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        JSON.stringify({
          status: "error",
          http_status: 422,
          message: "model failed",
          data: null,
          errors: null,
          code: "MODEL_FAILED",
          request_id: "request-id",
          meta: null,
        }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamPlanTurn(
        { axonCorePort: "17777", axonCoreToken: "token" },
        request,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("model failed");
  });
});
