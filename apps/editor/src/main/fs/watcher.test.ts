import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { type ChokidarOptions, type FSWatcher } from "chokidar";
import { describe, expect, it, vi } from "vitest";
import { FileWatcherManager } from "./watcher";

function createFakeWatcher() {
  const watcher = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };
  watcher.close = vi.fn(async () => undefined);
  queueMicrotask(() => watcher.emit("ready"));
  return watcher as unknown as FSWatcher;
}

describe("FileWatcherManager", () => {
  it("reloads active files after in-place and atomic replacement writes", async () => {
    vi.useFakeTimers();
    const filePath = path.join(os.tmpdir(), "axon-active-watch.ts");
    const events: Array<{ channel: string; payload?: unknown }> = [];
    let watcher: FSWatcher;
    const manager = new FileWatcherManager({
      shouldPollWatchers: false,
      shouldIgnoreWorkspaceWatchPath: () => false,
      sendToRenderer: (channel, payload) => events.push({ channel, payload }),
      getGitWatchPaths: async () => [],
      stopLanguageServersForFolder: () => undefined,
      notifyLanguageServersOfFileChange: () => undefined,
      invalidateWorkspaceIndex: () => undefined,
      createWatcher: () => {
        watcher = createFakeWatcher();
        return watcher;
      },
    });

    try {
      await fs.promises.writeFile(filePath, "first");
      await manager.watchFile(filePath);
      watcher!.emit("change", filePath);
      await vi.advanceTimersByTimeAsync(80);
      expect(events[events.length - 1]).toEqual({
        channel: "fs:fileChanged",
        payload: { path: filePath, content: "first" },
      });

      await fs.promises.writeFile(filePath, "second");
      watcher!.emit("add", filePath);
      await vi.advanceTimersByTimeAsync(80);
      expect(events[events.length - 1]).toEqual({
        channel: "fs:fileChanged",
        payload: { path: filePath, content: "second" },
      });
    } finally {
      await manager.closeAll();
      await fs.promises.rm(filePath, { force: true });
      vi.useRealTimers();
    }
  });

  it("preserves every changed path in a debounced workspace burst", async () => {
    const workspacePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "axon-watcher-burst-"),
    );
    const events: Array<{ channel: string; payload?: unknown }> = [];
    let watcher: FSWatcher;
    const manager = new FileWatcherManager({
      shouldPollWatchers: false,
      shouldIgnoreWorkspaceWatchPath: () => false,
      sendToRenderer: (channel, payload) => events.push({ channel, payload }),
      getGitWatchPaths: async () => [],
      stopLanguageServersForFolder: () => undefined,
      notifyLanguageServersOfFileChange: () => undefined,
      invalidateWorkspaceIndex: () => undefined,
      createWatcher: () => {
        watcher = createFakeWatcher();
        return watcher;
      },
    });
    const firstPath = path.join(workspacePath, "first.ts");
    const secondPath = path.join(workspacePath, "second.ts");

    try {
      await manager.watchFolder(workspacePath);
      events.length = 0;

      watcher!.emit("change", firstPath);
      watcher!.emit("change", secondPath);
      await new Promise((resolve) => setTimeout(resolve, 120));

      const changedPaths = events
        .filter((event) => event.channel === "fs:folderChanged")
        .map((event) => (event.payload as { path: string }).path);
      expect(changedPaths).toEqual([firstPath, secondPath]);
    } finally {
      await manager.closeAll();
      await fs.promises.rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("resyncs the workspace and Git state after the watcher becomes ready", async () => {
    const workspacePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "axon-watcher-"),
    );
    const events: Array<{ channel: string; payload?: unknown }> = [];
    const createWatcher = vi.fn(
      (_paths: string | string[], _options: ChokidarOptions) =>
        createFakeWatcher(),
    );
    const manager = new FileWatcherManager({
      shouldPollWatchers: false,
      shouldIgnoreWorkspaceWatchPath: () => false,
      sendToRenderer: (channel, payload) => events.push({ channel, payload }),
      getGitWatchPaths: async () => [],
      stopLanguageServersForFolder: () => undefined,
      notifyLanguageServersOfFileChange: () => undefined,
      invalidateWorkspaceIndex: () => undefined,
      createWatcher,
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

  it("starts Git watching when repository metadata is created later", async () => {
    const workspacePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "axon-git-init-watcher-"),
    );
    const gitDirectory = path.join(workspacePath, ".git");
    const headPath = path.join(gitDirectory, "HEAD");
    const events: Array<{ channel: string; payload?: unknown }> = [];
    const watchers: FSWatcher[] = [];
    let gitReady = false;
    const createWatcher = vi.fn(
      (_paths: string | string[], _options: ChokidarOptions) => {
        const watcher = createFakeWatcher();
        watchers.push(watcher);
        return watcher;
      },
    );
    const getGitWatchPaths = vi.fn(async () =>
      gitReady ? [headPath] : [],
    );
    const manager = new FileWatcherManager({
      shouldPollWatchers: false,
      shouldIgnoreWorkspaceWatchPath: (candidatePath) =>
        candidatePath.split(path.sep).includes(".git"),
      sendToRenderer: (channel, payload) => events.push({ channel, payload }),
      getGitWatchPaths,
      stopLanguageServersForFolder: () => undefined,
      notifyLanguageServersOfFileChange: () => undefined,
      invalidateWorkspaceIndex: () => undefined,
      createWatcher,
    });

    try {
      await manager.watchFolder(workspacePath);
      const folderWatcherOptions = createWatcher.mock.calls[0][1];
      const ignored = folderWatcherOptions.ignored;
      expect(typeof ignored).toBe("function");
      if (typeof ignored === "function") {
        expect(ignored(gitDirectory)).toBe(false);
        expect(ignored(headPath)).toBe(true);
      }
      const initialGitChangedCount = events.filter(
        (event) => event.channel === "git:changed",
      ).length;

      gitReady = true;
      watchers[0].emit("addDir", gitDirectory);

      await vi.waitFor(
        () => {
          expect(getGitWatchPaths.mock.calls.length).toBeGreaterThan(1);
          expect(createWatcher).toHaveBeenCalledTimes(2);
          expect(
            events.filter((event) => event.channel === "git:changed").length,
          ).toBeGreaterThan(initialGitChangedCount);
        },
        { timeout: 3_000 },
      );
    } finally {
      await manager.closeAll();
      await fs.promises.rm(workspacePath, { recursive: true, force: true });
    }
  });
});
