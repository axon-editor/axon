import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { FileWatcherManager } from "./watcher";

describe("FileWatcherManager", () => {
  it("resyncs the workspace and Git state after the watcher becomes ready", async () => {
    const workspacePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "axon-watcher-"),
    );
    const events: Array<{ channel: string; payload?: unknown }> = [];
    const manager = new FileWatcherManager({
      shouldPollWatchers: false,
      shouldIgnoreWorkspaceWatchPath: () => false,
      sendToRenderer: (channel, payload) => events.push({ channel, payload }),
      getGitWatchPaths: async () => [],
      stopLanguageServersForFolder: () => undefined,
      notifyLanguageServersOfFileChange: () => undefined,
      invalidateWorkspaceIndex: () => undefined,
    });

    try {
      await manager.watchFolder(workspacePath);

      expect(events).toContainEqual({
        channel: "fs:folderChanged",
        payload: { path: workspacePath },
      });
      expect(events).toContainEqual({
        channel: "git:changed",
        payload: { folderPath: workspacePath },
      });
    } finally {
      await manager.closeAll();
      await fs.promises.rm(workspacePath, { recursive: true, force: true });
    }
  });
});
