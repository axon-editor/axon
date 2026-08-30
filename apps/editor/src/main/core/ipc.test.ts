import { beforeEach, describe, expect, it, vi } from "vitest";

const windows: Array<{
  isDestroyed: ReturnType<typeof vi.fn>;
  webContents: {
    isDestroyed: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}> = [];

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => windows),
    getFocusedWindow: vi.fn(() => null),
  },
}));

import { createMainProcessIpc } from "./ipc";

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    },
  };
}

describe("main-process renderer delivery", () => {
  beforeEach(() => {
    windows.splice(0);
  });

  it("broadcasts global service state to every live window", () => {
    const first = createWindow();
    const second = createWindow();
    windows.push(first, second);
    const ipc = createMainProcessIpc({ getMainWindow: () => first as any });

    ipc.broadcastToRenderers("core:status", { status: "running" });

    expect(first.webContents.send).toHaveBeenCalledWith("core:status", {
      status: "running",
    });
    expect(second.webContents.send).toHaveBeenCalledWith("core:status", {
      status: "running",
    });
  });

  it("keeps targeted notifications in their owning window", () => {
    const first = createWindow();
    const second = createWindow();
    windows.push(first, second);
    const ipc = createMainProcessIpc({ getMainWindow: () => first as any });

    ipc.sendToRenderer("task:output", { line: "owned" }, second as any);

    expect(first.webContents.send).not.toHaveBeenCalled();
    expect(second.webContents.send).toHaveBeenCalledWith("task:output", {
      line: "owned",
    });
  });
});
