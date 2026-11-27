/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? testState.userData : ""),
  },
}));

import { normalizeSettings } from "../../../shared/core/settings";
import {
  readSettingsForFolder,
  writeWorkspaceOverlayToDisk,
} from "./io";
import { pickWorkspaceOverlay } from "../workspace/scope";

describe("workspace settings persistence", () => {
  let root = "";
  let userSettingsPath = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axon-settings-"));
    testState.userData = path.join(root, "userdata");
    fs.mkdirSync(testState.userData, { recursive: true });
    userSettingsPath = path.join(testState.userData, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeUserSettings(settings: ReturnType<typeof normalizeSettings>) {
    fs.writeFileSync(userSettingsPath, JSON.stringify(settings), "utf-8");
  }

  it("ignores app chrome stored in a legacy workspace file", async () => {
    writeUserSettings(
      normalizeSettings({
        editor: {
          themeId: "one-dark",
          appGlassMode: "off",
          sidebarSide: "left",
        },
        lsp: { enabled: true, pythonVirtualEnvPath: "/global" },
      }),
    );

    const workspace = path.join(root, "project");
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "axon.json"),
      JSON.stringify({
        editor: {
          themeId: "vitesse-refined",
          appGlassMode: "system",
          sidebarSide: "right",
        },
        theme_overrides: {},
        lsp: { pythonVirtualEnvPath: "/project" },
      }),
      "utf-8",
    );

    const settings = await readSettingsForFolder(workspace);

    expect(settings.editor.themeId).toBe("one-dark");
    expect(settings.editor.appGlassMode).toBe("off");
    expect(settings.editor.sidebarSide).toBe("left");
    expect(settings.lsp.pythonVirtualEnvPath).toBe("/project");
  });

  it("merges a partial legacy environment without resetting user values", async () => {
    writeUserSettings(
      normalizeSettings({
        lsp: {
          enabled: false,
          pythonVirtualEnvPath: "/global",
          pythonInterpreterPath: "/global/bin/python",
        },
      }),
    );

    const workspace = path.join(root, "project");
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "axon.json"),
      JSON.stringify({ lsp: { pythonInterpreterPath: "/project/bin/python" } }),
      "utf-8",
    );

    const settings = await readSettingsForFolder(workspace);

    expect(settings.lsp).toEqual({
      enabled: false,
      pythonVirtualEnvPath: "/global",
      pythonInterpreterPath: "/project/bin/python",
    });
  });

  it("writes only the project overlay to the workspace file", () => {
    const workspaceSettingsPath = path.join(root, "project", "axon.json");

    writeWorkspaceOverlayToDisk(
      pickWorkspaceOverlay(
        normalizeSettings({
          editor: { themeId: "one-dark", appGlassMode: "system" },
          lsp: { pythonVirtualEnvPath: "/project" },
        }),
      ),
      workspaceSettingsPath,
    );

    const written = JSON.parse(
      fs.readFileSync(workspaceSettingsPath, "utf-8"),
    );

    expect(Object.keys(written)).toEqual(["lsp"]);
    expect(written.editor).toBeUndefined();
    expect(written.theme_overrides).toBeUndefined();
    expect(written.lsp.pythonVirtualEnvPath).toBe("/project");
  });
});
