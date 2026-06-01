// Exposes a controlled API surface to the renderer via contextBridge.
// The renderer never gets direct Node.js access, only what is explicitly
// defined here. fs.onFileChanged uses ipcRenderer.on so the main process
// can push file change events to the renderer without polling.

import { contextBridge, ipcRenderer } from "electron";
import { type AxonSettings } from "../shared/settings";
import { type AxonCommand } from "../shared/commands";
import { type EditorDiagnostic } from "../shared/diagnostics";
import {
  type GitActionResult,
  type GitDiffResult,
  type GitStatusResult,
} from "../shared/git";

contextBridge.exposeInMainWorld("axon", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  getSettings: (folderPath?: string | null) =>
    ipcRenderer.invoke("settings:get", folderPath),
  updateSettings: (settings: AxonSettings, folderPath?: string | null) =>
    ipcRenderer.invoke("settings:update", settings, folderPath),
  ensureSettingsFile: (folderPath?: string | null, settings?: AxonSettings) =>
    ipcRenderer.invoke("settings:ensureFile", folderPath, settings),
  getProjectDiagnostics: (folderPath: string): Promise<EditorDiagnostic[]> =>
    ipcRenderer.invoke("diagnostics:project", folderPath),
  getGitStatus: (folderPath: string): Promise<GitStatusResult> =>
    ipcRenderer.invoke("git:status", folderPath),
  getGitDiff: (
    folderPath: string,
    filePath: string,
    staged?: boolean,
    untracked?: boolean,
  ): Promise<GitDiffResult> =>
    ipcRenderer.invoke("git:diff", folderPath, filePath, staged, untracked),
  getGitFileBase: (folderPath: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke("git:baseFile", folderPath, filePath),
  runGitAction: (
    folderPath: string,
    filePath: string,
    action: "stage" | "unstage" | "discard",
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:action", folderPath, filePath, action),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
  watchFile: (path: string) => ipcRenderer.invoke("fs:watch", path),
  unwatchFile: () => ipcRenderer.invoke("fs:unwatch"),
  watchFolder: (path: string) => ipcRenderer.invoke("fs:watchFolder", path),
  unwatchFolder: () => ipcRenderer.invoke("fs:unwatchFolder"),

  onFileChanged: (
    callback: (data: { path: string; content: string }) => void,
  ) => {
    const handler = (_: unknown, data: { path: string; content: string }) =>
      callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },

  // notifies renderer when any file is created, deleted, or renamed in the folder
  onFolderChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("fs:folderChanged", handler);
    return () => ipcRenderer.removeListener("fs:folderChanged", handler);
  },
  onGitChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("git:changed", handler);
    return () => ipcRenderer.removeListener("git:changed", handler);
  },

  onMenuCommand: (callback: (command: AxonCommand) => void) => {
    const handler = (_: unknown, command: AxonCommand) => callback(command);
    ipcRenderer.on("menu:command", handler);
    return () => ipcRenderer.removeListener("menu:command", handler);
  },
});
