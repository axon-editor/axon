/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AiChatRequest,
  type AiChatStreamEvent,
  type AiModelMessage,
  type AiModelToolCall,
} from "../../../shared/ai/ai";
import { runAgentLoop } from "./agentLoop";
import { getToolDefinitions, runTool, streamPlanTurn } from "./coreClient";
import { startCoreAiStream } from "../streaming/coreStream";

vi.mock("./coreClient", () => ({
  getToolDefinitions: vi.fn(),
  runTool: vi.fn(),
  streamPlanTurn: vi.fn(),
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

function queuePlanTurn(turn: {
  content: string;
  thinking?: string;
  toolCalls?: AiModelToolCall[];
  messages?: AiModelMessage[];
}) {
  vi.mocked(streamPlanTurn).mockImplementationOnce(
    async (_core, _request, _signal, onThought) => {
      if (turn.thinking) onThought(turn.thinking);
      return {
        messages: _request.messages?.length
          ? _request.messages
          : (turn.messages ?? baseMessages),
        message: {
          role: "assistant",
          content: turn.content,
          tool_calls: turn.toolCalls,
        },
      };
    },
  );
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.mocked(getToolDefinitions).mockResolvedValue([]);
    vi.mocked(streamPlanTurn).mockReset();
    vi.mocked(startCoreAiStream).mockReset();
  });

  it("uses the planning answer instead of generating it a second time", async () => {
    queuePlanTurn({ content: "Hi there" });

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

  it("streams the final planning reasoning before the answer", async () => {
    queuePlanTurn({
      content: "Hi there",
      thinking: "The user greeted me, so I should greet them back.",
    });

    const { events, finished } = collectRun();
    await finished;

    const thoughtIndex = events.findIndex(
      (event) =>
        event.type === "thought" &&
        event.thought === "The user greeted me, so I should greet them back.",
    );
    const deltaIndex = events.findIndex(
      (event) => event.type === "delta" && event.delta === "Hi there",
    );
    expect(thoughtIndex).toBeGreaterThan(-1);
    expect(deltaIndex).toBeGreaterThan(thoughtIndex);
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
    queuePlanTurn({
      content: "I'll open the README first.",
      thinking: "The README probably documents the project.",
      toolCalls: [
        {
          function: {
            name: "read_file",
            arguments: { path: "README.md" },
          },
        },
      ],
    });
    queuePlanTurn({ content: "The README is short." });
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
      "thought:The README probably documents the project.",
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
    queuePlanTurn({ content: "   " });
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
