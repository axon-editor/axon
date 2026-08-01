import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map<string, (...args: any[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

import { registerFileWatcherHandlers } from "./handlers";
import type { FileWatcherManager } from "./watcher";

class FakeSender extends EventEmitter {
  readonly send = vi.fn();

  constructor(readonly id: number) {
    super();
  }

  isDestroyed() {
    return false;
  }
}

function createManager() {
  return {
    watchFile: vi.fn(),
    unwatchFile: vi.fn(),
    watchFolder: vi.fn(),
    unwatchFolder: vi.fn(),
    closeAll: vi.fn(),
  } as unknown as FileWatcherManager;
}

describe("file watcher IPC ownership", () => {
  beforeEach(() => {
    ipcHandlers.clear();
  });

  it("shares workspace watchers while keeping active file watchers per window", async () => {
    const managers: FileWatcherManager[] = [];
    const senders: Array<(channel: string, payload?: unknown) => void> = [];
    registerFileWatcherHandlers((sendToRenderer) => {
      const manager = createManager();
      managers.push(manager);
      senders.push(sendToRenderer);
      return manager;
    });

    const firstWindow = new FakeSender(1);
    const secondWindow = new FakeSender(2);
    const watchFolder = ipcHandlers.get("fs:watchFolder")!;
    const watchFile = ipcHandlers.get("fs:watch")!;

    await watchFolder({ sender: firstWindow }, "/workspace/one");
    await watchFolder({ sender: secondWindow }, "/workspace/one");
    await watchFile({ sender: firstWindow }, "/workspace/one/first.ts");
    await watchFile({ sender: secondWindow }, "/workspace/one/second.ts");

    expect(managers).toHaveLength(3);
    expect(managers[0].watchFolder).toHaveBeenCalledTimes(1);
    senders[0]("git:changed", { folderPath: "/workspace/one" });
    expect(firstWindow.send).toHaveBeenCalledWith("git:changed", {
      folderPath: "/workspace/one",
    });
    expect(secondWindow.send).toHaveBeenCalledWith("git:changed", {
      folderPath: "/workspace/one",
    });

    firstWindow.emit("destroyed");
    expect(managers[1].closeAll).toHaveBeenCalledTimes(1);
    expect(managers[2].closeAll).not.toHaveBeenCalled();
    expect(managers[0].unwatchFolder).not.toHaveBeenCalled();

    secondWindow.emit("destroyed");
    expect(managers[2].closeAll).toHaveBeenCalledTimes(1);
    expect(managers[0].unwatchFolder).toHaveBeenCalledTimes(1);
  });
});
