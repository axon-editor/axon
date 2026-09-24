/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Narrow preload for the dedicated Settings window (editor.openSettingsIn =
// "window"). It deliberately exposes only the bridges the settings surface
// needs: settings persistence, live preview + action relays, theme/font/model
// pickers, and a read-only extension listing for the theme registry. There is
// no coreRequest, filesystem, LSP, or Git surface here, so the settings renderer
// has the smallest privileged attack surface of any Axon window.

import { contextBridge, ipcRenderer } from "electron";
import {
  type AppGlassMode,
  type AxonSettings,
  type CustomFont,
} from "../shared/settings";
import { type ExtensionState } from "../shared/extensions";
import { type AiModelInfo } from "../shared/ai";
import { type PythonWorkspaceEnvironmentStatus } from "../shared/lsp";

contextBridge.exposeInMainWorld("axon", {
  surface: "settings",
  platform: process.platform,
  getSettings: (folderPath?: string | null): Promise<AxonSettings> =>
    ipcRenderer.invoke("settings:get", folderPath),
  updateSettings: (
    settings: AxonSettings,
    folderPath?: string | null,
  ): Promise<AxonSettings> =>
    ipcRenderer.invoke("settings:update", settings, folderPath),
  // Live draft preview: main relays it to the editor windows but never writes
  // it, keeping the window surface consistent with the tab surface's preview.
  previewSettings: (settings: AxonSettings): Promise<void> =>
    ipcRenderer.invoke("settings:preview", settings),
  sendSettingsAction: (
    action: "openLanguageTools" | "viewLogs",
  ): Promise<void> => ipcRenderer.invoke("settings:action", action),
  closeSettingsWindow: (): Promise<void> =>
    ipcRenderer.invoke("settings:closeWindow"),
  importFont: (): Promise<CustomFont | null> =>
    ipcRenderer.invoke("dialog:importFont"),
  listAvailableFonts: (): Promise<CustomFont[]> =>
    ipcRenderer.invoke("fonts:listAvailable"),
  selectEditorBackgroundImage: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:selectEditorBackgroundImage"),
  selectPythonVirtualEnv: (
    folderPath?: string | null,
  ): Promise<{
    virtualEnvPath: string;
    interpreterPath: string;
  } | null> => ipcRenderer.invoke("dialog:selectPythonVirtualEnv", folderPath),
  getPythonWorkspaceEnvironment: (
    folderPath?: string | null,
    activeLanguageId?: string,
  ): Promise<PythonWorkspaceEnvironmentStatus> =>
    ipcRenderer.invoke(
      "settings:getPythonEnvironment",
      folderPath,
      activeLanguageId,
    ),
  listAiModels: (folderPath?: string | null): Promise<AiModelInfo[]> =>
    ipcRenderer.invoke("ai:listModels", folderPath),
  getFinderSyncEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke("finderSync:getEnabled"),
  setFinderSyncEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke("finderSync:setEnabled", enabled),
  setWindowGlass: (
    mode: AppGlassMode,
    opaqueBackground: string,
    appearance: "light" | "dark",
  ): Promise<void> =>
    ipcRenderer.invoke("window:setGlass", mode, opaqueBackground, appearance),
  // Listing extension metadata (never activating them) is enough to feed
  // getEnabledExtensionThemes so the theme picker and window chrome resolve the
  // same built-in registry as the editor without running every extension's
  // onStartup work just to open the settings pane.
  listExtensions: (folderPath?: string | null): Promise<ExtensionState> =>
    ipcRenderer.invoke("extensions:list", folderPath),
});