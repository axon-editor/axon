/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  type AgentMessage,
  type AgentToolCallState,
} from "../types/agentConversation";
import {
  agentTimeline,
  appendAgentStatus,
  appendAgentText,
  appendAgentThought,
  appendAgentTool,
  finalizeAgentTimeline,
  updateAgentTool,
} from "./index";

const tool: AgentToolCallState = {
  id: "call-1",
  name: "read_file",
  kind: "workspace",
  title: "read_file",
  arguments: { path: "README.md" },
  status: "pending",
};

function baseMessage(): AgentMessage {
  return { id: 1, role: "assistant", content: "" };
}

describe("agent timeline", () => {
  it("keeps thoughts, text, tools, and statuses in the order they arrive", () => {
    let message = baseMessage();
    message = appendAgentStatus(message, "Thinking...");
    message = appendAgentThought(message, "I'll open the README first.");
    message = appendAgentTool(message, tool);
    message = updateAgentTool(message, tool.id, {
      status: "done",
      result: "# Axon",
    });
    message = appendAgentStatus(message, "Finished read_file.");
    message = appendAgentText(message, "The README is short.");

    expect(message.timeline?.map((entry) => entry.kind)).toEqual([
      "thought",
      "tool",
      "status",
      "text",
    ]);
    expect(message.content).toBe("The README is short.");

    const toolEntry = message.timeline?.find((entry) => entry.kind === "tool");
    expect(toolEntry?.kind === "tool" ? toolEntry.tool.status : null).toBe(
      "done",
    );
  });

  it("replaces the generic thinking status with the real thought", () => {
    let message = appendAgentStatus(baseMessage(), "Thinking...");
    message = appendAgentThought(message, "I'll open the README first.");

    expect(message.timeline?.map((entry) => entry.kind)).toEqual(["thought"]);
    expect(message.activity).toBeUndefined();
  });

  it("merges consecutive streaming thought chunks into one block", () => {
    let message = appendAgentThought(baseMessage(), "I need to ");
    message = appendAgentThought(message, "read the README.");

    expect(message.timeline?.map((entry) => entry.kind)).toEqual(["thought"]);
    const thought = message.timeline?.[0];
    expect(thought?.kind === "thought" ? thought.content : "").toBe(
      "I need to read the README.",
    );
  });

  it("merges consecutive deltas into the open text block", () => {
    let message = appendAgentStatus(baseMessage(), "Thinking...");
    message = appendAgentText(message, "Hello");
    message = appendAgentText(message, " there");

    expect(
      message.timeline?.filter((entry) => entry.kind === "text"),
    ).toHaveLength(1);
    expect(message.content).toBe("Hello there");
    expect(message.reveal).toBe(true);
  });

  it("keeps legacy content before tools when no timeline exists", () => {
    const message = {
      ...baseMessage(),
      content: "old answer",
      toolCalls: [tool],
    };

    expect(agentTimeline(message).map((entry) => entry.kind)).toEqual([
      "text",
      "tool",
    ]);
  });

  it("strips edit proposal JSON from timeline text on finalize", () => {
    let message = appendAgentStatus(baseMessage(), "Thinking...");
    message = appendAgentText(
      message,
      'Here is the change.\n```json\n{"editProposal":{"title":"x","files":[]}}\n```',
    );

    const finalized = finalizeAgentTimeline(message, "Here is the change.");
    const text = finalized.timeline?.find((entry) => entry.kind === "text");

    expect(finalized.content).toBe("Here is the change.");
    expect(text?.kind === "text" ? text.content : "").toBe(
      "Here is the change.",
    );
  });
});
