/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCommandHistory,
  loadCommandHistory,
  recordTypedCommand,
  resetCommandHistoryForTests,
} from "../../../../../extensions/builtin/terminal/workbench/lib/commandHistoryStore";

const getTerminalCommandHistory = vi.fn();

describe("commandHistoryStore", () => {
  beforeEach(() => {
    resetCommandHistoryForTests();
    getTerminalCommandHistory.mockReset();
    getTerminalCommandHistory.mockResolvedValue(["git status", "ls -la"]);
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: { getTerminalCommandHistory },
    });
  });

  afterEach(() => {
    resetCommandHistoryForTests();
  });

  it("reads the history file once inside the cache window", async () => {
    await loadCommandHistory();
    await loadCommandHistory();

    expect(getTerminalCommandHistory).toHaveBeenCalledOnce();
    expect(getCommandHistory()).toEqual(["git status", "ls -la"]);
  });

  it("keeps a command run in this session ahead of the file", async () => {
    await loadCommandHistory();
    recordTypedCommand("npm run build");

    expect(getCommandHistory()).toEqual([
      "npm run build",
      "git status",
      "ls -la",
    ]);
  });

  it("moves a repeated command to the front instead of duplicating it", async () => {
    await loadCommandHistory();
    recordTypedCommand("git status");
    recordTypedCommand("git status");

    expect(getCommandHistory()).toEqual(["git status", "ls -la"]);
  });

  it("ignores commands the shell would not have recorded", async () => {
    await loadCommandHistory();
    recordTypedCommand("   secret value");
    recordTypedCommand("   ");

    expect(getCommandHistory()).toEqual(["git status", "ls -la"]);
  });

  it("keeps commands typed while the file read is still in flight", async () => {
    let resolveHistory: ((commands: string[]) => void) | undefined;
    getTerminalCommandHistory.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveHistory = resolve;
        }),
    );

    const loading = loadCommandHistory();
    recordTypedCommand("cargo test");
    resolveHistory?.(["git status"]);

    await loading;
    expect(getCommandHistory()).toEqual(["cargo test", "git status"]);
  });

  it("keeps the terminal usable when the history read fails", async () => {
    getTerminalCommandHistory.mockRejectedValue(new Error("no history file"));

    await expect(loadCommandHistory()).resolves.toEqual([]);
    expect(getCommandHistory()).toEqual([]);
  });
});
