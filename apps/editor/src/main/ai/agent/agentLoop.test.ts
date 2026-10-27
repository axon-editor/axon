/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
} from "../../../shared/ai/ai";
import { runAgentLoop } from "./agentLoop";
import { getToolDefinitions, planTurn, runTool } from "./coreClient";
import { startCoreAiStream } from "../streaming/coreStream";

vi.mock("./coreClient", () => ({
  getToolDefinitions: vi.fn(),
  planTurn: vi.fn(),
  runTool: vi.fn(),
}));

vi.mock("../streaming/coreStream", () => ({
  cancelCoreAiStream: vi.fn(),
  startCoreAiStream: vi.fn(),
}));

vi.mock("./uiToolBridge", () => ({
  proposeUiTool: vi.fn(),
  rejectUiToolsForRequest: vi.fn(),
}));

const request: AiChatRequest = {
  action: "agent",
  prompt: "hello",
  folderPath: "/workspace",
  activeFilePath: null,
  files: [],
  diagnostics: [],
  gitChanges: [],
  conversation: [],
};

const baseMessages = [
  { role: "system" as const, content: "system prompt" },
  { role: "user" as const, content: "hello" },
];

function collectRun() {
  const events: AiChatStreamEvent[] = [];
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { requestId } = runAgentLoop({
    axonCorePort: "17777",
    axonCoreToken: "test-token",
    request,
    send: (event) => {
      events.push(event);
      if (event.type === "done") finish();
    },
  });
  return { events, finished, requestId };
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.mocked(getToolDefinitions).mockResolvedValue([]);
    vi.mocked(startCoreAiStream).mockReset();
  });

  it("uses the planning answer instead of generating it a second time", async () => {
    vi.mocked(planTurn).mockResolvedValue({
      messages: baseMessages,
      message: { role: "assistant", content: "Hi there" },
    });

    const { events, finished, requestId } = collectRun();
    await finished;

    expect(events).toContainEqual({
      requestId,
      type: "delta",
      delta: "Hi there",
    });
    expect(events[events.length - 1]).toEqual({
      requestId,
      type: "done",
      done: true,
    });
    expect(startCoreAiStream).not.toHaveBeenCalled();
  });

  it("orders planning text, tool statuses, and the final answer by event time", async () => {
    vi.mocked(getToolDefinitions).mockResolvedValue([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: {},
        },
      },
    ]);
    vi.mocked(planTurn)
      .mockResolvedValueOnce({
        messages: baseMessages,
        message: {
          role: "assistant",
          content: "I'll open the README first.",
          tool_calls: [
            {
              function: {
                name: "read_file",
                arguments: { path: "README.md" },
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        messages: baseMessages,
        message: { role: "assistant", content: "The README is short." },
      });
    vi.mocked(runTool).mockResolvedValue("# Axon");

    const { events, finished } = collectRun();
    await finished;

    const ordered = events.map((event) => {
      if (event.type === "thought") return `thought:${event.thought}`;
      if (event.type === "delta") return `delta:${event.delta}`;
      if (event.type === "status") return `status:${event.status}`;
      if (event.type === "tool-started") {
        return `tool-started:${event.tool?.name}`;
      }
      if (event.type === "tool-result") {
        return `tool-result:${event.tool?.name}`;
      }
      return event.type;
    });

    expect(ordered).toEqual([
      "status:Thinking...",
      "thought:I'll open the README first.",
      "status:Running read_file...",
      "tool-started:read_file",
      "tool-result:read_file",
      "status:Finished read_file.",
      "status:Reviewing tool results...",
      "delta:The README is short.",
      "done",
    ]);
  });

  it("streams when the planning turn returns no content", async () => {
    vi.mocked(planTurn).mockResolvedValue({
      messages: baseMessages,
      message: { role: "assistant", content: "   " },
    });
    vi.mocked(startCoreAiStream).mockImplementation((input) => {
      input.send({ requestId: input.requestId ?? "stream", type: "done", done: true });
      return { success: true, requestId: input.requestId ?? "stream" };
    });

    const { events, finished, requestId } = collectRun();
    await finished;

    expect(startCoreAiStream).toHaveBeenCalledTimes(1);
    expect(events).not.toContainEqual({
      requestId,
      type: "delta",
      delta: "   ",
    });
    expect(events[events.length - 1]).toEqual({
      requestId,
      type: "done",
      done: true,
    });
  });
});
