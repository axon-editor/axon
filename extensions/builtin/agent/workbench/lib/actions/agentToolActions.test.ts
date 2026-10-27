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
    writeFile: vi.fn(async () => undefined),
  };
}

describe("runAgentUiTool", () => {
  it("writes a workspace-relative file when write_file is approved", async () => {
    const tools = deps();

    const result = await runAgentUiTool(tools, "write_file", {
      path: "me.txt",
      content: "this is gorden",
    });

    expect(tools.writeFile).toHaveBeenCalledWith(
      "/workspace/me.txt",
      "this is gorden",
    );
    expect(result).toEqual({ ok: true, message: "/workspace/me.txt" });
  });

  it("rejects write_file without a path", async () => {
    const tools = deps();

    const result = await runAgentUiTool(tools, "write_file", {
      content: "this is gorden",
    });

    expect(tools.writeFile).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("reports a failed write instead of claiming success", async () => {
    const tools = deps();
    tools.writeFile.mockRejectedValue(new Error("disk is full"));

    const result = await runAgentUiTool(tools, "write_file", {
      path: "me.txt",
      content: "this is gorden",
    });

    expect(result).toEqual({ ok: false, message: "disk is full" });
  });
});
