/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";

const { nativeTheme } = vi.hoisted(() => ({
  nativeTheme: { themeSource: "system" },
}));

vi.mock("electron", () => ({ nativeTheme }));

import {
  applyWindowGlass,
  refreshWindowGlass,
  synchronizeNativeGlassAppearance,
} from "./windowGlass";

describe("native Glass appearance", () => {
  beforeEach(() => {
    nativeTheme.themeSource = "system";
  });

  it("matches native Glass to a selected light theme", () => {
    synchronizeNativeGlassAppearance("system", "light");

    expect(nativeTheme.themeSource).toBe("light");
  });

  it("matches native Glass to a selected dark theme", () => {
    synchronizeNativeGlassAppearance("live", "dark");

    expect(nativeTheme.themeSource).toBe("dark");
  });

  it("returns native controls to the system appearance when Glass is off", () => {
    synchronizeNativeGlassAppearance("off", "light");

    expect(nativeTheme.themeSource).toBe("system");
  });
});

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    setVibrancy: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    webContents: { invalidate: vi.fn() },
  };
}

const describeMac = process.platform === "darwin" ? describe : describe.skip;

describeMac("native Glass transitions", () => {
  beforeEach(() => {
    nativeTheme.themeSource = "system";
  });

  it("rebuilds macOS vibrancy when Glass turns on", () => {
    const window = createWindow();

    applyWindowGlass(
      window as unknown as BrowserWindow,
      "off",
      "#123456",
      "dark",
    );
    applyWindowGlass(
      window as unknown as BrowserWindow,
      "system",
      "#123456",
      "dark",
    );

    expect(window.setVibrancy.mock.calls).toEqual([
      [null],
      [null],
      ["under-window"],
    ]);
    expect(window.setBackgroundColor.mock.calls).toEqual([
      ["#123456"],
      ["#123456"],
      ["#00000000"],
    ]);
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild macOS vibrancy when Glass was already on", () => {
    const window = createWindow();

    applyWindowGlass(
      window as unknown as BrowserWindow,
      "system",
      "#123456",
      "dark",
    );
    applyWindowGlass(
      window as unknown as BrowserWindow,
      "live",
      "#123456",
      "dark",
    );

    expect(window.setVibrancy.mock.calls).toEqual([
      ["under-window"],
      ["under-window"],
    ]);
    expect(window.setBackgroundColor.mock.calls).toEqual([
      ["#00000000"],
      ["#00000000"],
    ]);
    expect(window.webContents.invalidate).not.toHaveBeenCalled();
  });

  it("invalidates only windows that still exist", () => {
    const window = createWindow();

    refreshWindowGlass(window as unknown as BrowserWindow);
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(1);

    window.isDestroyed.mockReturnValue(true);
    refreshWindowGlass(window as unknown as BrowserWindow);
    expect(window.webContents.invalidate).toHaveBeenCalledTimes(1);

    expect(() => refreshWindowGlass(null)).not.toThrow();
  });
});
