/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Narrow preload for the floating Terminal window. Like the Settings window
// preload it exposes no core/fs/LSP surface: the window only ever renders live
// PTY sessions, so it needs settings + extension list to sync the theme, glass
// for the native chrome, external-link routing, and the dock handshake that
// returns its sessions to the editor. The terminal itself talks to the PTY host
// through core:createTerminalTicket on the editor's granted workspace root.

import { contextBridge, ipcRenderer } from "electron";
import { type AppGlassMode, type AxonSettings } from "../shared/settings";
import { type ExtensionState } from "../shared/extensions";
import { type TerminalWindowHandoff } from "../shared/terminalWindow";

contextBridge.exposeInMainWorld("axon", {
  surface: "terminal",
  platform: process.platform,
  getSettings: (folderPath?: string | null): Promise<AxonSettings> =>
    ipcRenderer.invoke("settings:get", folderPath),
  listExtensions: (folderPath?: string | null): Promise<ExtensionState> =>
    ipcRenderer.invoke("extensions:list", folderPath),
  // Terminal sessions connect to the PTY host through a ticket minted by core;
  // getTerminalBackendUrl calls this for every reconnect. Main grants the
  // window's renderer a capability for the handed-off workspace root before it
  // loads, so the ticket's workspace check passes for inherited cwd paths.
  createTerminalTicket: (workingDirectory: string | null): Promise<string> =>
    ipcRenderer.invoke("core:createTerminalTicket", workingDirectory),
  setWindowGlass: (
    mode: AppGlassMode,
    opaqueBackground: string,
    appearance: "light" | "dark",
  ): Promise<void> =>
    ipcRenderer.invoke("window:setGlass", mode, opaqueBackground, appearance),
  openExternalLink: (href: string): Promise<void> =>
    ipcRenderer.invoke("shell:openExternal", href),
  onSettingsPreview: (callback: (settings: AxonSettings) => void) => {
    const handler = (_: unknown, settings: AxonSettings) => callback(settings);
    ipcRenderer.on("settings:preview", handler);
    return () => ipcRenderer.removeListener("settings:preview", handler);
  },
  onSettingsChanged: (callback: (settings: AxonSettings) => void) => {
    const handler = (_: unknown, settings: AxonSettings) => callback(settings);
    ipcRenderer.on("settings:changed", handler);
    return () => ipcRenderer.removeListener("settings:changed", handler);
  },
  // The handoff is pulled instead of pushed: main pushes it once on
  // did-finish-load, which can arrive before React mounts, and a pull covers
  // reloads and reconnects without main keeping per-window state in sync.
  getTerminalWindowHandoff: (): Promise<TerminalWindowHandoff | null> =>
    ipcRenderer.invoke("terminal:getHandoff"),
  onTerminalDockRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("terminal:dockRequest", handler);
    return () => ipcRenderer.removeListener("terminal:dockRequest", handler);
  },
  dockTerminalWindow: (
    handoff: TerminalWindowHandoff,
  ): Promise<void> => ipcRenderer.invoke("terminal:dock", handoff),
});