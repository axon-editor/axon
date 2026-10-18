/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

vi.mock("electron", () => ({
  app: {},
  BrowserWindow: class {},
  shell: {},
}));
vi.mock("../../settings/bootAppearance", () => ({
  readBootAppearance: vi.fn(),
}));
vi.mock("../menu/menu", () => ({ buildApplicationMenu: vi.fn() }));
vi.mock("../glass/windowGlass", () => ({
  applyWindowGlass: vi.fn(),
  getWindowGlassBackground: vi.fn(),
  getWindowGlassConstructorOptions: vi.fn(),
  synchronizeNativeGlassAppearance: vi.fn(),
}));

import { getEditorWebPreferences, notifyRendererOfFullScreen } from "./createWindow";

describe("editor BrowserWindow preferences", () => {
  it("keeps background work alive without weakening renderer isolation", () => {
    expect(getEditorWebPreferences("/app/preload.js")).toEqual({
      preload: "/app/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    });
  });
});

describe("notifyRendererOfFullScreen", () => {
  function makeWindow(options: {
    destroyed?: boolean;
    contentsDestroyed?: boolean;
    fullScreen?: boolean;
  }) {
    const send = vi.fn();
    const window = {
      isDestroyed: () => options.destroyed ?? false,
      isFullScreen: () => options.fullScreen ?? true,
      webContents: {
        isDestroyed: () => options.contentsDestroyed ?? false,
        send,
      },
    } as unknown as BrowserWindow;
    return { window, send };
  }

  it("pushes the native fullscreen state to the renderer", () => {
    const { window, send } = makeWindow({ fullScreen: true });

    notifyRendererOfFullScreen(window);

    expect(send).toHaveBeenCalledExactlyOnceWith("window:fullScreenChanged", true);
  });

  it("reports fullscreen exit so the renderer can restore its inset", () => {
    const { window, send } = makeWindow({ fullScreen: false });

    notifyRendererOfFullScreen(window);

    expect(send).toHaveBeenCalledExactlyOnceWith("window:fullScreenChanged", false);
  });

  it("never touches a window torn down mid-transition", () => {
    const destroyed = makeWindow({ destroyed: true });
    const contentsDestroyed = makeWindow({ contentsDestroyed: true });

    notifyRendererOfFullScreen(destroyed.window);
    notifyRendererOfFullScreen(contentsDestroyed.window);

    expect(destroyed.send).not.toHaveBeenCalled();
    expect(contentsDestroyed.send).not.toHaveBeenCalled();
  });
});
