import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {},
  BrowserWindow: class {},
  shell: {},
}));
vi.mock("../settings/bootAppearance", () => ({
  readBootAppearance: vi.fn(),
}));
vi.mock("./menu", () => ({ buildApplicationMenu: vi.fn() }));
vi.mock("./windowGlass", () => ({
  applyWindowGlass: vi.fn(),
  getWindowGlassBackground: vi.fn(),
  getWindowGlassConstructorOptions: vi.fn(),
  synchronizeNativeGlassAppearance: vi.fn(),
}));

import { getEditorWebPreferences } from "./createWindow";

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
