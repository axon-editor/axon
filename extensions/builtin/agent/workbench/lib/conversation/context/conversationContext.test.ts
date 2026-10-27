/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type AiChatResult } from "@axon-editor/shared/ai/ai";
import {
  type AgentMessage,
  type AgentToolCallState,
} from "../types/agentConversation";
import { conversationContext } from "./conversationContext";
import { messageToolActivity } from "./messageToolActivity";

function assistant(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return { id: 1, role: "assistant", content: "", ...overrides };
}

function tool(
  overrides: Partial<AgentToolCallState> = {},
): AgentToolCallState {
  return {
    id: "call-1",
    name: "read_file",
    kind: "workspace",
    title: "Read file",
    arguments: { path: "README.md" },
    status: "done",
    result: "# Axon",
    ...overrides,
  };
}

describe("conversationContext", () => {
  it("carries write_file results into the next turn without the file body", () => {
    const messages: AgentMessage[] = [
      { id: 1, role: "user", content: "create me.txt" },
      assistant({
        id: 2,
        content: "Created me.txt.",
        toolCalls: [
          tool({
            name: "write_file",
            kind: "ui",
            arguments: { path: "me.txt", content: "this is gorden" },
            result: "/workspace/me.txt",
          }),
        ],
      }),
    ];

    expect(conversationContext(messages)[1]).toEqual({
      role: "assistant",
      content:
        "Created me.txt.\n\nTool activity:\n- write_file(path: me.txt, content: 1 line) -> done: /workspace/me.txt",
    });
  });

  it("keeps an assistant message that contains only tool activity", () => {
    const messages = [
      assistant({
        toolCalls: [tool({ result: "this is gorden" })],
      }),
    ];

    expect(conversationContext(messages)).toEqual([
      {
        role: "assistant",
        content:
          "Tool activity:\n- read_file(path: README.md) -> done: this is gorden",
      },
    ]);
  });

  it("recovers tools from the timeline when toolCalls is missing", () => {
    const messages = [
      assistant({
        timeline: [
          {
            id: "tool-1",
            kind: "tool",
            tool: tool({ result: "this is gorden" }),
          },
        ],
      }),
    ];

    expect(conversationContext(messages)[0]?.content).toContain(
      "read_file(path: README.md) -> done: this is gorden",
    );
  });

  it("summarizes an edit proposal by title and paths", () => {
    const result: AiChatResult = {
      success: true,
      message: "Proposed the file.",
      modelLabel: "test",
      providerLabel: "test",
      editProposal: {
        title: "Create me.txt",
        files: [
          {
            path: "me.txt",
            newContent: "this is gorden",
            summary: "Create the file",
          },
        ],
      },
    };

    expect(
      conversationContext([assistant({ result })])[0]?.content,
    ).toContain("Tool activity:\n- edit proposal: Create me.txt (me.txt)");
  });

  it("caps a long tool activity summary", () => {
    const tools = Array.from({ length: 30 }, (_, index) =>
      tool({
        id: `call-${index}`,
        arguments: { path: `file-${index}.txt` },
        result: "x".repeat(200),
      }),
    );

    const summary = messageToolActivity(assistant({ toolCalls: tools }));

    expect(summary.length).toBeLessThanOrEqual(2000);
    expect(summary.endsWith("...")).toBe(true);
  });

  it("drops empty messages before taking the last twelve", () => {
    const messages: AgentMessage[] = Array.from(
      { length: 14 },
      (_, index): AgentMessage => ({
        id: index,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message ${index}`,
      }),
    );
    messages.push({ id: 14, role: "assistant", content: "   " });

    const context = conversationContext(messages);

    expect(context).toHaveLength(12);
    expect(context[0].content).toBe("message 2");
  });
});
