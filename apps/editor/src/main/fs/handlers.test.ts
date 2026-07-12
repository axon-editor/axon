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
  constructor(readonly id: number) {
    super();
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

  it("keeps watcher managers isolated per renderer window", async () => {
    const managers: FileWatcherManager[] = [];
    registerFileWatcherHandlers(() => {
      const manager = createManager();
      managers.push(manager);
      return manager;
    });

    const firstWindow = new FakeSender(1);
    const secondWindow = new FakeSender(2);
    const watchFolder = ipcHandlers.get("fs:watchFolder")!;

    await watchFolder({ sender: firstWindow }, "/workspace/one");
    await watchFolder({ sender: secondWindow }, "/workspace/two");
    await watchFolder({ sender: firstWindow }, "/workspace/one-next");

    expect(managers).toHaveLength(2);
    expect(managers[0].watchFolder).toHaveBeenCalledTimes(2);
    expect(managers[1].watchFolder).toHaveBeenCalledTimes(1);
    expect(managers[0].closeAll).not.toHaveBeenCalled();
    expect(managers[1].closeAll).not.toHaveBeenCalled();

    firstWindow.emit("destroyed");
    expect(managers[0].closeAll).toHaveBeenCalledTimes(1);
    expect(managers[1].closeAll).not.toHaveBeenCalled();
  });
});
