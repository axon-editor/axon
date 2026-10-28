/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "@axon-editor/shared/ai/agentConversations";
import {
  type AgentConversationState,
  type AgentMessage,
  type AgentTimelineEntry,
} from "../types/agentConversation";
import { selectConversationAction } from "../actions/selectConversationAction";
import { loadAgentConversationState } from "./loadAgentConversationState";
import {
  flushAllAgentConversations,
} from "./saveAgentConversation";
import { saveActiveAgentConversation } from "./saveActiveAgentConversation";

type AgentConversationBridge = Pick<
  Window["axon"],
  | "loadAgentConversations"
  | "saveAgentConversations"
  | "saveAgentConversation"
>;

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

let bridge: AgentConversationBridge;
let storedStates: Map<string | null, AgentConversationSnapshot>;

function installBridge() {
  storedStates = new Map();
  bridge = {
    loadAgentConversations: vi.fn(
      async (folderPath: string | null) =>
        storedStates.get(folderPath) ?? null,
    ),
    saveAgentConversations: vi.fn(
      async (
        folderPath: string | null,
        state: AgentConversationSnapshot,
      ) => {
        storedStates.set(folderPath, clone(state));
      },
    ),
    saveAgentConversation: vi.fn(
      async (
        folderPath: string | null,
        conversation: AgentConversationRecord,
        activeId: string,
      ) => {
        const current = storedStates.get(folderPath) ?? {
          activeId,
          conversations: [],
        };
        const nextConversation = clone(conversation);
        const existingIndex = current.conversations.findIndex(
          (item) => item.id === nextConversation.id,
        );
        const conversations =
          existingIndex >= 0
            ? current.conversations.map((item, index) =>
                index === existingIndex ? nextConversation : item,
              )
            : [...current.conversations, nextConversation];
        storedStates.set(folderPath, { activeId, conversations });
      },
    ),
  };
  Object.defineProperty(window, "axon", {
    configurable: true,
    value: bridge,
  });
}

function saveAndFlush(
  folderPath: string | null,
  state: AgentConversationState,
  messages: AgentMessage[],
) {
  const nextState = saveActiveAgentConversation(folderPath, state, messages);
  flushAllAgentConversations();
  return nextState;
}

describe("agent conversation storage", () => {
  beforeEach(() => {
    localStorage.clear();
    installBridge();
  });

  afterEach(() => {
    flushAllAgentConversations();
    vi.clearAllMocks();
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

    saveAndFlush("/workspace", emptyState(), messages);

    const stored = storedStates.get("/workspace");
    const savedMessage = stored?.conversations[0].messages[1] as AgentMessage;

    expect(savedMessage.timeline).toEqual([thoughtEntry, toolEntry, textEntry]);
    expect(savedMessage.reveal).toBeUndefined();
    expect(savedMessage.activity).toBeUndefined();
  });

  it("saves only the active conversation while messages stream", () => {
    saveActiveAgentConversation(null, emptyState(), [
      { id: 1, role: "user", content: "list the root" },
    ]);
    flushAllAgentConversations();

    expect(bridge.saveAgentConversation).toHaveBeenCalledTimes(1);
    expect(bridge.saveAgentConversations).not.toHaveBeenCalled();
  });

  it("merges a pending message save into a structural snapshot", () => {
    saveActiveAgentConversation(null, emptyState(), [
      { id: 1, role: "user", content: "hello" },
      { id: 2, role: "assistant", content: "hi" },
    ]);

    selectConversationAction(null, emptyState(), "explain-selection");

    const stored = storedStates.get(null);
    expect(stored?.conversations[0].messages).toHaveLength(2);
    expect(stored?.conversations[0].action).toBe("explain-selection");
  });

  it("restores thoughts and tool cards without replaying old animations", async () => {
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

    saveAndFlush(null, emptyState(), messages);
    const loaded = await loadAgentConversationState(null);
    const loadedMessage = loaded.conversations[0].messages[0];

    expect(loadedMessage.timeline).toEqual([thoughtEntry, toolEntry, textEntry]);
    expect(loadedMessage.reveal).toBeUndefined();
    expect(loadedMessage.activity).toBeUndefined();
  });

  it("keeps an assistant message that only contains thinking and tools", async () => {
    const messages: AgentMessage[] = [
      {
        id: 2,
        role: "assistant",
        content: "",
        timeline: [thoughtEntry, toolEntry],
      },
    ];

    saveAndFlush(null, emptyState(), messages);
    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].messages).toHaveLength(1);
    expect(loaded.conversations[0].messages[0].timeline).toEqual([
      thoughtEntry,
      toolEntry,
    ]);
  });

  it("drops malformed timeline entries instead of crashing the renderer", async () => {
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

    saveAndFlush(null, emptyState(), messages);
    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0].timeline).toEqual([
      thoughtEntry,
    ]);
  });

  it("still loads conversations saved before timelines were persisted", async () => {
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

    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0]).toMatchObject({
      id: 1,
      role: "assistant",
      content: "Old answer",
    });
    expect(loaded.conversations[0].messages[0].timeline).toBeUndefined();
    expect(
      localStorage.getItem("axon:agentConversations:no-workspace"),
    ).toBeNull();
  });

  it("migrates current and legacy keys for every workspace", async () => {
    localStorage.setItem(
      "axon:agentConversations:/workspace/one",
      JSON.stringify(emptyState()),
    );
    localStorage.setItem(
      "axon:agentConversation:/workspace/two",
      JSON.stringify([{ id: 1, role: "user", content: "hello" }]),
    );

    await loadAgentConversationState("/workspace/one");

    expect(storedStates.has("/workspace/one")).toBe(true);
    expect(storedStates.has("/workspace/two")).toBe(true);
    expect(
      localStorage.getItem("axon:agentConversations:/workspace/one"),
    ).toBeNull();
    expect(
      localStorage.getItem("axon:agentConversation:/workspace/two"),
    ).toBeNull();
  });

  it("keeps an existing JSON store over localStorage data", async () => {
    const stored = emptyState();
    stored.conversations[0].messages = [
      { id: 9, role: "assistant", content: "From JSON" },
    ];
    storedStates.set(null, stored);
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
            messages: [{ id: 1, role: "assistant", content: "From storage" }],
          },
        ],
      }),
    );

    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0].content).toBe("From JSON");
    expect(
      localStorage.getItem("axon:agentConversations:no-workspace"),
    ).toBeNull();
  });

  it("initializes a JSON store when no conversation exists yet", async () => {
    const loaded = await loadAgentConversationState("/workspace/new");

    expect(loaded.conversations).toHaveLength(1);
    expect(storedStates.has("/workspace/new")).toBe(true);
  });

  it("persists the edit proposal result so its card survives a switch", async () => {
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

    saveAndFlush(null, emptyState(), messages);
    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].messages[0].result).toEqual(result);
  });

  it("persists the selected action with the conversation", async () => {
    const state = selectConversationAction(
      null,
      emptyState(),
      "explain-selection",
    );

    expect(state.conversations[0].action).toBe("explain-selection");

    const loaded = await loadAgentConversationState(null);
    expect(loaded.conversations[0].action).toBe("explain-selection");
  });

  it("derives the action from old messages when none was saved", async () => {
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

    const loaded = await loadAgentConversationState(null);

    expect(loaded.conversations[0].action).toBe("fix-problem");
  });
});
