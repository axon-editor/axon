/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { normalizeState } from "./normalizeState";

describe("normalizeState", () => {
  it("preserves the persisted OpenCode session id", () => {
    const state = normalizeState({
      activeId: "c1",
      conversations: [
        {
          id: "c1",
          title: "Test",
          createdAt: 1,
          updatedAt: 2,
          pinned: false,
          action: "agent",
          messages: [],
          backendSessionId: "ses_123",
        },
      ],
    });

    expect(state?.conversations[0]?.backendSessionId).toBe("ses_123");
  });

  it("accepts a CLI conversation with a timeline", () => {
    const state = normalizeState({
      activeId: "cli-1",
      conversations: [
        {
          id: "cli-1",
          title: "CLI",
          createdAt: 1,
          updatedAt: 2,
          pinned: false,
          action: "agent",
          messages: [
            { id: 1, role: "user", content: "read main.go" },
            {
              id: 2,
              role: "assistant",
              content: "It has a main package.",
              timeline: [
                {
                  id: "t2-1",
                  kind: "thought",
                  content: "checking the file",
                },
                {
                  id: "t2-2",
                  kind: "tool",
                  tool: {
                    id: "call-1",
                    name: "read_file",
                    kind: "workspace",
                    title: "read_file",
                    arguments: { path: "main.go" },
                    status: "done",
                    result: "package main",
                    approval: "session",
                  },
                },
                {
                  id: "t2-3",
                  kind: "text",
                  content: "It has a main package.",
                },
              ],
            },
          ],
        },
      ],
    });

    const messages = state?.conversations[0]?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[1]?.timeline).toHaveLength(3);
    expect(messages[1]?.timeline?.[1]).toMatchObject({
      kind: "tool",
      tool: {
        name: "read_file",
        status: "done",
        result: "package main",
      },
    });
  });
});
