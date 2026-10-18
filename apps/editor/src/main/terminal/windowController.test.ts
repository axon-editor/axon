/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  type WindowListener = (...args: unknown[]) => void;

  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    readonly listeners = new Map<string, WindowListener[]>();
    readonly options: Record<string, unknown>;
    fullScreen = false;
    readonly webContents = {
      id: 900,
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      isDestroyed: () => false,
      send: vi.fn(),
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeBrowserWindow.instances.push(this);
      this.webContents.id = 900 + FakeBrowserWindow.instances.length;
    }

    on(event: string, callback: WindowListener) {
      const existing = this.listeners.get(event) ?? [];
      existing.push(callback);
      this.listeners.set(event, existing);
      return this;
    }

    emit(event: string) {
      for (const callback of this.listeners.get(event) ?? []) callback();
    }

    isDestroyed() {
      return false;
    }

    isFullScreen() {
      return this.fullScreen;
    }

    isMinimized() {
      return false;
    }

    restore() {}

    focus() {}

    close() {}

    destroy() {}

    loadURL() {
      return Promise.resolve();
    }

    loadFile() {
      return Promise.resolve();
    }
  }

  const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
  return { FakeBrowserWindow, ipcHandlers };
});

vi.mock("electron", () => ({
  app: { on: vi.fn() },
  BrowserWindow: hoisted.FakeBrowserWindow,
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      hoisted.ipcHandlers.set(channel, handler);
    }),
  },
  shell: { openExternal: vi.fn() },
  webContents: { fromId: vi.fn(() => null) },
}));
vi.mock("../settings/bootAppearance", () => ({
  readBootAppearance: vi.fn(() => ({
    background: "#000000",
    appearance: "dark",
    glassMode: "off",
  })),
}));
vi.mock("../window/glass/windowGlass", () => ({
  applyWindowGlass: vi.fn(),
  getWindowGlassBackground: vi.fn(() => "#000000"),
  getWindowGlassConstructorOptions: vi.fn(() => ({})),
}));
vi.mock("../window/create/createWindow", () => ({
  notifyRendererOfFullScreen: vi.fn(),
}));

import { notifyRendererOfFullScreen } from "../window/create/createWindow";
import { createTerminalWindowController } from "./windowController";

const notifyFullScreen = vi.mocked(notifyRendererOfFullScreen);

function openTerminalWindow() {
  const open = hoisted.ipcHandlers.get("terminal:openWindow");
  if (!open) throw new Error("terminal:openWindow handler was not registered");
  open(
    { sender: { id: 42 } },
    {
      workspaceRoot: "/repo",
      tabs: [],
      activeTabId: null,
      createNonce: 1,
      dockMode: "show",
    },
  );
  const instances = hoisted.FakeBrowserWindow.instances;
  const window = instances[instances.length - 1];
  if (!window) throw new Error("terminal window was not created");
  return window;
}

describe("terminal window fullscreen forwarding", () => {
  beforeEach(() => {
    hoisted.FakeBrowserWindow.instances.length = 0;
    hoisted.ipcHandlers.clear();
    notifyFullScreen.mockClear();
    createTerminalWindowController({
      axonDevServerUrl: "http://localhost:5173",
      isDev: true,
      isMac: true,
      isWindows: false,
      getAxonIconPath: () => "/icon.png",
      workspaceCapabilities: {
        authorize: vi.fn(),
        releaseRenderer: vi.fn(),
      },
    } as never);
  });

  it("forwards native fullscreen entry so the renderer drops its inset", () => {
    const window = openTerminalWindow();

    window.emit("enter-full-screen");

    expect(notifyFullScreen).toHaveBeenCalledExactlyOnceWith(window);
  });

  it("forwards native fullscreen exit so the renderer restores its inset", () => {
    const window = openTerminalWindow();

    window.emit("leave-full-screen");

    expect(notifyFullScreen).toHaveBeenCalledExactlyOnceWith(window);
  });

  it("wires both native transitions on every opened window", () => {
    const window = openTerminalWindow();

    expect(window.listeners.has("enter-full-screen")).toBe(true);
    expect(window.listeners.has("leave-full-screen")).toBe(true);
  });
});
