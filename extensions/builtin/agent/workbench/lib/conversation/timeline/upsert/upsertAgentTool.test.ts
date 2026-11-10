/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type AgentMessage } from "../../types/agentConversation";
import { upsertAgentTool } from "./upsertAgentTool";

const message: AgentMessage = {
  id: 1,
  role: "assistant",
  content: "",
};

const tool = {
  id: "call_1",
  name: "shell",
  kind: "workspace" as const,
  title: "Run command",
  arguments: { command: "echo hi" },
  status: "running" as const,
};

describe("upsertAgentTool", () => {
  it("appends a tool the first time", () => {
    const next = upsertAgentTool(message, tool);
    expect(next.timeline).toHaveLength(1);
  });

  it("updates an existing tool instead of appending a duplicate", () => {
    const first = upsertAgentTool(message, tool);
    const second = upsertAgentTool(first, {
      ...tool,
      status: "pending",
      permissionOnly: true,
    });

    expect(second.timeline).toHaveLength(1);
    const entry = second.timeline?.[0];
    expect(entry?.kind).toBe("tool");
    if (entry?.kind === "tool") {
      expect(entry.tool.status).toBe("pending");
      expect(entry.tool.permissionOnly).toBe(true);
    }
  });
});
