/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from "vitest";
import {
  type AgentConversationState,
  type AgentMessage,
  type AgentTimelineEntry,
} from "../types/agentConversation";
import { selectConversationAction } from "../actions/selectConversationAction";
import { loadAgentConversationState } from "./loadAgentConversationState";
import { saveActiveAgentConversation } from "./saveActiveAgentConversation";

function emptyState(): AgentConversationState {
  return {
    activeId: "conversation-1",
    conversations: [
      {
        id: "conversation-1",
        title: "Test conversation",
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        action: "agent",
        messages: [],
      },
    ],
  };
}

const thoughtEntry: AgentTimelineEntry = {
  id: "thought-1",
  kind: "thought",
  content: "I should inspect the workspace root first.",
};

const toolEntry: AgentTimelineEntry = {
  id: "tool-1",
  kind: "tool",
  tool: {
    id: "call-1",
    name: "list_files",
    kind: "workspace",
    title: "List files",
    arguments: { path: "" },
    status: "done",
    result: "list_files results:\napps/",
  },
};

const textEntry: AgentTimelineEntry = {
  id: "text-1",
  kind: "text",
  content: "The root contains apps/.",
};

describe("agent conversation storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the timeline so thinking survives a conversation switch", () => {
    const messages: AgentMessage[] = [
      { id: 1, role: "user", content: "list the root" },
      {
        id: 2,
        role: "assistant",
        content: "The root contains apps/.",
        reveal: true,
        activity: "Thinking...",
        timeline: [thoughtEntry, toolEntry, textEntry],
      },
    ];

    saveActiveAgentConversation("/workspace", emptyState(), messages);

    const raw = localStorage.getItem("axon:agentConversations:/workspace");
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw ?? "null");
    const savedMessage = saved.conversations[0].messages[1];

    expect(savedMessage.timeline).toEqual([thoughtEntry, toolEntry, textEntry]);
    expect(savedMessage.reveal).toBeUndefined();
    expect(savedMessage.activity).toBeUndefined();
  });

  it("restores thoughts and tool cards without replaying old animations", () => {
    const messages: AgentMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "The root contains apps/.",
        reveal: true,
        activity: "Thinking...",
        timeline: [thoughtEntry, toolEntry, textEntry],
      },
    ];

    saveActiveAgentConversation(null, emptyState(), messages);
    const loaded = loadAgentConversationState(null);
    const loadedMessage = loaded.conversations[0].messages[0];

    expect(loadedMessage.timeline).toEqual([thoughtEntry, toolEntry, textEntry]);
    expect(loadedMessage.reveal).toBeUndefined();
    expect(loadedMessage.activity).toBeUndefined();
  });

  it("keeps an assistant message that only contains thinking and tools", () => {
    const messages: AgentMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "",
        timeline: [thoughtEntry, toolEntry],
      },
    ];

    saveActiveAgentConversation(null, emptyState(), messages);
    const loaded = loadAgentConversationState(null);

    expect(loaded.conversations[0].messages).toHaveLength(1);
    expect(loaded.conversations[0].messages[0].timeline).toEqual([
      thoughtEntry,
      toolEntry,
    ]);
  });

  it("drops malformed timeline entries instead of crashing the renderer", () => {
    const messages: AgentMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "Answer",
        timeline: [
          thoughtEntry,
          { id: "bad-thought", kind: "thought" },
          { id: "bad-tool", kind: "tool", tool: { id: "call-2" } },
        ] as unknown as AgentTimelineEntry[],
      },
    ];

    saveActiveAgentConversation(null, emptyState(), messages);
    const loaded = loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0].timeline).toEqual([
      thoughtEntry,
    ]);
  });

  it("still loads conversations saved before timelines were persisted", () => {
    localStorage.setItem(
      "axon:agentConversations:no-workspace",
      JSON.stringify({
        activeId: "conversation-1",
        conversations: [
          {
            id: "conversation-1",
            title: "Old conversation",
            createdAt: 1,
            updatedAt: 1,
            pinned: false,
            messages: [{ id: 1, role: "assistant", content: "Old answer" }],
          },
        ],
      }),
    );

    const loaded = loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0]).toMatchObject({
      id: 1,
      role: "assistant",
      content: "Old answer",
    });
    expect(loaded.conversations[0].messages[0].timeline).toBeUndefined();
  });

  it("persists the edit proposal result so its card survives a switch", () => {
    const result = {
      success: true,
      message: "Proposed an edit.",
      modelLabel: "Axon model",
      providerLabel: "Axon models",
      editProposal: {
        title: "Update greeting",
        files: [
          {
            path: "src/greeting.ts",
            newContent: "export const greeting = \"hi\";\n",
            summary: "Update the greeting",
          },
        ],
      },
    };
    const messages: AgentMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "Proposed an edit.",
        result,
      },
    ];

    saveActiveAgentConversation(null, emptyState(), messages);
    const loaded = loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0].result).toEqual(result);
  });

  it("persists the selected action with the conversation", () => {
    const state = selectConversationAction(
      null,
      emptyState(),
      "explain-selection",
    );

    expect(state.conversations[0].action).toBe("explain-selection");

    const loaded = loadAgentConversationState(null);
    expect(loaded.conversations[0].action).toBe("explain-selection");
  });

  it("derives the action from old messages when none was saved", () => {
    localStorage.setItem(
      "axon:agentConversations:no-workspace",
      JSON.stringify({
        activeId: "conversation-1",
        conversations: [
          {
            id: "conversation-1",
            title: "Old conversation",
            createdAt: 1,
            updatedAt: 1,
            pinned: false,
            messages: [
              {
                id: 1,
                role: "assistant",
                content: "Old answer",
                action: "fix-problem",
              },
            ],
          },
        ],
      }),
    );

    const loaded = loadAgentConversationState(null);

    expect(loaded.conversations[0].action).toBe("fix-problem");
  });
});
