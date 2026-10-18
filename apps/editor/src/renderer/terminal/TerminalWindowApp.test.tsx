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
import TerminalWindowApp from "./TerminalWindowApp";

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
  resolveActiveTheme: () => null,
}));
vi.mock("@axon-builtin-terminal/Terminal", () => ({
  default: (props: { nativeControlInset?: { start: number; end: number } }) => (
    <div
      data-testid="terminal-stub"
      data-inset={JSON.stringify(props.nativeControlInset ?? null)}
    />
  ),
}));
vi.mock("@axon-builtin-terminal/lib/contribution", () => ({
  resolveTerminalWorkbenchContribution: () => ({}),
}));
vi.mock("../../workbench/app/lib/glass/glassTheme", () => ({
  createGlassThemeCssVariables: () => ({}),
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function readInset(container: HTMLElement) {
  const stub = container.querySelector('[data-testid="terminal-stub"]');
  expect(stub).not.toBeNull();
  return JSON.parse(stub!.getAttribute("data-inset") ?? "null");
}

describe("TerminalWindowApp native control inset", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fullScreenListener: ((isFullScreen: boolean) => void) | null;
  let isWindowFullScreen: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

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
    fullScreenListener = null;
    isWindowFullScreen = vi.fn(() => Promise.resolve(false));
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: {
        platform: "darwin",
        isWindowFullScreen,
        onWindowFullScreenChanged: (
          listener: (isFullScreen: boolean) => void,
        ) => {
          fullScreenListener = listener;
          return vi.fn();
        },
        getSettings: () =>
          Promise.resolve({ editor: { themeId: "dark" } } as never),
        listExtensions: () => Promise.resolve({} as never),
        getTerminalWindowHandoff: () =>
          Promise.resolve({
            workspaceRoot: "/repo",
            tabs: [],
            activeTabId: null,
            createNonce: 1,
            dockMode: "show",
          }),
        onSettingsPreview: () => () => {},
        onSettingsChanged: () => () => {},
        onTerminalDockRequest: () => () => {},
        setWindowGlass: () => Promise.resolve(),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reserves the traffic-light inset while the window is normal", async () => {
    isWindowFullScreen.mockResolvedValue(false);

    await act(async () => root.render(<TerminalWindowApp />));

    expect(readInset(container)).toEqual({ start: 80, end: 0 });
  });

  it("drops the inset on native fullscreen entry and restores it on exit", async () => {
    isWindowFullScreen.mockResolvedValue(false);
    await act(async () => root.render(<TerminalWindowApp />));

    act(() => fullScreenListener?.(true));
    expect(readInset(container)).toEqual({ start: 0, end: 0 });

    act(() => fullScreenListener?.(false));
    expect(readInset(container)).toEqual({ start: 80, end: 0 });
  });

  it("boots straight into fullscreen without keeping stale padding", async () => {
    isWindowFullScreen.mockResolvedValue(true);

    await act(async () => root.render(<TerminalWindowApp />));

    expect(readInset(container)).toEqual({ start: 0, end: 0 });
  });
});
