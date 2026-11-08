/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import SettingsSurfaceRoot from "./SettingsSurfaceRoot";

vi.mock("@axon-editor/shared/core/settings", () => ({
  normalizeSettings: (settings: unknown) => settings,
}));
vi.mock("@axon-editor/shared/extensions/extensions", () => ({
  getEnabledExtensionThemes: () => [],
}));
vi.mock("@axon-editor/renderer/shared/lib/theme/themeTokens", () => ({
  createThemeCssVariables: () => ({}),
  resolveThemeTokens: () => ({ background: "#000000" }),
}));
vi.mock("@axon-editor/renderer/shared/themes/syntax/tokenThemes", () => ({
  resolveActiveTheme: () => ({ appearance: "dark" }),
}));
vi.mock("../../workbench/app/lib/glass/glassTheme", () => ({
  createGlassThemeCssVariables: () => ({}),
}));
vi.mock("@axon-builtin-settings/settings/SettingsTab", () => ({
  default: (props: {
    folderPath: string | null;
    onSave: (settings: unknown) => void;
  }) => (
    <div data-testid="settings-tab" data-folder={props.folderPath ?? "user"}>
      <button
        type="button"
        data-testid="save-settings"
        onClick={() => void props.onSave({ editor: { themeId: "dark" } })}
      >
        save
      </button>
    </div>
  ),
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

// The surface resolves its scope, then loads settings, then commits. Each step
// settles on a separate microtask, so the tests drain a few turns before
// asserting instead of assuming a single Promise.resolve is enough.
async function flush() {
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) {
      await Promise.resolve();
    }
  });
}

describe("SettingsSurfaceRoot workspace scope", () => {
  let container: HTMLDivElement;
  let root: Root;
  let workspaceListener: ((folderPath: string | null) => void) | null;
  let getSettingsWorkspace: ReturnType<typeof vi.fn>;
  let getSettings: ReturnType<typeof vi.fn>;
  let listExtensions: ReturnType<typeof vi.fn>;
  let updateSettings: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    workspaceListener = null;

    getSettingsWorkspace = vi.fn(() => Promise.resolve("/repo/a"));
    getSettings = vi.fn(() =>
      Promise.resolve({ editor: { themeId: "dark" } }),
    );
    listExtensions = vi.fn(() => Promise.resolve({}));
    updateSettings = vi.fn((settings: unknown) => Promise.resolve(settings));

    Object.defineProperty(window, "axon", {
      configurable: true,
      value: {
        platform: "darwin",
        getSettingsWorkspace,
        onSettingsWorkspaceChanged: (
          listener: (folderPath: string | null) => void,
        ) => {
          workspaceListener = listener;
          return vi.fn();
        },
        getSettings,
        listAvailableFonts: () => Promise.resolve([]),
        listExtensions,
        updateSettings,
        previewSettings: () => Promise.resolve(),
        setWindowGlass: () => Promise.resolve(),
        refreshWindowGlass: () => Promise.resolve(),
        closeSettingsWindow: () => Promise.resolve(),
        sendSettingsAction: () => Promise.resolve(),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderSurface() {
    await act(async () => root.render(<SettingsSurfaceRoot />));
    await flush();
  }

  function readFolder() {
    return container
      .querySelector('[data-testid="settings-tab"]')
      ?.getAttribute("data-folder");
  }

  it("loads the workspace settings instead of the global ones", async () => {
    await renderSurface();

    expect(getSettingsWorkspace).toHaveBeenCalledTimes(1);
    expect(getSettings).toHaveBeenCalledWith("/repo/a");
    expect(listExtensions).toHaveBeenCalledWith("/repo/a");
    expect(readFolder()).toBe("/repo/a");
  });

  it("rebinds to a new workspace when another editor opens settings", async () => {
    await renderSurface();
    const firstTab = container.querySelector('[data-testid="settings-tab"]');

    act(() => workspaceListener?.("/repo/b"));
    await flush();

    expect(getSettings).toHaveBeenCalledWith("/repo/b");
    expect(listExtensions).toHaveBeenCalledWith("/repo/b");
    expect(readFolder()).toBe("/repo/b");
    // The key change must remount the tab so a draft from the previous
    // workspace cannot be saved into the newly selected one.
    expect(container.querySelector('[data-testid="settings-tab"]')).not.toBe(
      firstTab,
    );
  });

  it("saves to the active workspace", async () => {
    await renderSurface();

    const saveButton = container.querySelector(
      '[data-testid="save-settings"]',
    ) as HTMLButtonElement;
    await act(async () => saveButton.click());
    await flush();

    expect(updateSettings).toHaveBeenCalledWith(
      { editor: { themeId: "dark" } },
      "/repo/a",
    );
  });
});
