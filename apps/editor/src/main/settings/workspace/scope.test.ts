/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../../../shared/core/settings";
import {
  lspSettingsEqual,
  mergeWorkspaceOverlay,
  parseWorkspaceOverlay,
} from "./scope";

describe("workspace settings overlay", () => {
  it("reads only the project keys from a legacy full document", () => {
    const overlay = parseWorkspaceOverlay({
      editor: { themeId: "one-dark", appGlassMode: "system" },
      theme_overrides: {},
      lsp: {
        enabled: false,
        pythonVirtualEnvPath: " /venv ",
        pythonInterpreterPath: "/venv/bin/python",
      },
    });

    expect(overlay).toEqual({
      lsp: {
        enabled: false,
        pythonVirtualEnvPath: "/venv",
        pythonInterpreterPath: "/venv/bin/python",
      },
    });
  });

  it("ignores a workspace file without an lsp section", () => {
    expect(parseWorkspaceOverlay({ editor: { themeId: "one-dark" } })).toBeNull();
    expect(parseWorkspaceOverlay(null)).toBeNull();
    expect(parseWorkspaceOverlay({ lsp: "not an object" })).toBeNull();
  });

  it("keeps user values for keys the overlay does not define", () => {
    const appSettings = normalizeSettings({
      lsp: {
        enabled: true,
        pythonVirtualEnvPath: "/global",
        pythonInterpreterPath: "/global/bin/python",
      },
    });

    const merged = mergeWorkspaceOverlay(appSettings, {
      lsp: { pythonVirtualEnvPath: "/project" },
    });

    expect(merged.lsp).toEqual({
      enabled: true,
      pythonVirtualEnvPath: "/project",
      pythonInterpreterPath: "/global/bin/python",
    });
  });

  it("detects an explicit environment change in the draft", () => {
    const loaded = normalizeSettings({
      lsp: { pythonVirtualEnvPath: "/project" },
    }).lsp;
    const untouched = normalizeSettings({
      lsp: { pythonVirtualEnvPath: "/project" },
    }).lsp;
    const changed = normalizeSettings({
      lsp: { pythonVirtualEnvPath: "/other" },
    }).lsp;

    expect(lspSettingsEqual(untouched, loaded)).toBe(true);
    expect(lspSettingsEqual(changed, loaded)).toBe(false);
  });
});
