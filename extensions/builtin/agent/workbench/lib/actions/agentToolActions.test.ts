/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { runAgentUiTool } from "./agentToolActions";

function deps() {
  return {
    folderPath: "/workspace",
    openFile: vi.fn(),
    closeFile: vi.fn(() => true),
    runCommand: vi.fn(),
  };
}

describe("runAgentUiTool", () => {
  it("approves a workspace-relative write without touching the filesystem", async () => {
    const tools = deps();

    const result = await runAgentUiTool(tools, "write_file", {
      path: "me.txt",
      content: "this is gorden",
    });

    expect(result).toEqual({ ok: true, message: "/workspace/me.txt" });
  });

  it("rejects write_file without a path", async () => {
    const tools = deps();

    const result = await runAgentUiTool(tools, "write_file", {
      content: "this is gorden",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects write_file without content", async () => {
    const tools = deps();

    const result = await runAgentUiTool(tools, "write_file", {
      path: "me.txt",
    });

    expect(result).toEqual({
      ok: false,
      message: "No file content was provided.",
    });
  });
});
