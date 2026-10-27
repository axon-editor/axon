/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type AgentToolCallState } from "../types/agentConversation";
import { toolActivityLine } from "./toolActivityLine";

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
    ...overrides,
  };
}

describe("toolActivityLine", () => {
  it("summarizes write_file content by line count instead of repeating it", () => {
    const line = toolActivityLine(
      tool({
        name: "write_file",
        kind: "ui",
        arguments: { path: "me.txt", content: "one\ntwo\nthree" },
        result: "/workspace/me.txt",
      }),
    );

    expect(line).toBe(
      "- write_file(path: me.txt, content: 3 lines) -> done: /workspace/me.txt",
    );
    expect(line).not.toContain("two");
  });

  it("truncates a long tool result", () => {
    const line = toolActivityLine(tool({ result: "x".repeat(500) }));

    expect(line).toContain("read_file(path: README.md) -> done: ");
    expect(line.endsWith("...")).toBe(true);
    expect(line.length).toBeLessThan(300);
  });

  it("marks skipped and failed tools without calling them done", () => {
    expect(toolActivityLine(tool({ status: "rejected" }))).toContain(
      "-> skipped",
    );
    expect(
      toolActivityLine(
        tool({ status: "error", message: "permission denied" }),
      ),
    ).toContain("-> failed: permission denied");
  });

  it("keeps pending and running tools visibly unfinished", () => {
    expect(toolActivityLine(tool({ status: "pending" }))).toContain(
      "-> pending",
    );
    expect(toolActivityLine(tool({ status: "running" }))).toContain(
      "-> running",
    );
  });
});
