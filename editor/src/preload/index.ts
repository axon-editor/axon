// Exposes a controlled API surface to the renderer via contextBridge.
// The renderer never gets direct Node.js access, only what is explicitly
// defined here. fs.onFileChanged uses ipcRenderer.on so the main process
// can push file change events to the renderer without polling.

import { contextBridge, ipcRenderer } from "electron";
import { type AxonSettings, type CustomFont } from "../shared/settings";
import { type AxonCommand } from "../shared/commands";
import { type EditorDiagnostic } from "../shared/diagnostics";
import {
  type GitActionResult,
  type GitDiffResult,
  type GitStatusResult,
} from "../shared/git";
import {
  type TaskFinishedEvent,
  type TaskOutputEvent,
  type TaskRunResult,
  type WorkspaceTask,
} from "../shared/tasks";
import {
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerLifecycleResult,
  type LanguageServerStartForFileRequest,
  type LanguageServerStatus,
} from "../shared/lsp";
import {
  type UpdateActionResult,
  type UpdateInfo,
  type UpdateInstallState,
} from "../shared/updates";
import {
  type HtmlPreviewActionResult,
  type HtmlPreviewConsoleEvent,
} from "../shared/htmlPreview";

contextBridge.exposeInMainWorld("axon", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  importFont: (): Promise<CustomFont | null> =>
    ipcRenderer.invoke("dialog:importFont"),
  getSettings: (folderPath?: string | null) =>
    ipcRenderer.invoke("settings:get", folderPath),
  updateSettings: (settings: AxonSettings, folderPath?: string | null) =>
    ipcRenderer.invoke("settings:update", settings, folderPath),
  ensureSettingsFile: (folderPath?: string | null, settings?: AxonSettings) =>
    ipcRenderer.invoke("settings:ensureFile", folderPath, settings),
  getProjectDiagnostics: (folderPath: string): Promise<EditorDiagnostic[]> =>
    ipcRenderer.invoke("diagnostics:project", folderPath),
  getLanguageServerStatus: (
    folderPath: string,
  ): Promise<LanguageServerStatus[]> =>
    ipcRenderer.invoke("lsp:status", folderPath),
  startLanguageServers: (
    folderPath: string,
  ): Promise<LanguageServerLifecycleResult> =>
    ipcRenderer.invoke("lsp:start", folderPath),
  startLanguageServerForLanguage: (
    request: LanguageServerStartForFileRequest,
  ): Promise<LanguageServerLifecycleResult> =>
    ipcRenderer.invoke("lsp:startForLanguage", request),
  stopLanguageServers: (
    folderPath: string,
  ): Promise<LanguageServerLifecycleResult> =>
    ipcRenderer.invoke("lsp:stop", folderPath),
  getLanguageServerCompletions: (
    request: LanguageServerCompletionRequest,
  ): Promise<LanguageServerCompletionResult> =>
    ipcRenderer.invoke("lsp:completion", request),
  getGitStatus: (folderPath: string): Promise<GitStatusResult> =>
    ipcRenderer.invoke("git:status", folderPath),
  listWorkspaceTasks: (folderPath: string): Promise<WorkspaceTask[]> =>
    ipcRenderer.invoke("tasks:list", folderPath),
  runWorkspaceTask: (
    folderPath: string,
    taskId: string,
  ): Promise<TaskRunResult> =>
    ipcRenderer.invoke("tasks:run", folderPath, taskId),
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
  shouldRestoreSession: (): Promise<boolean> =>
    ipcRenderer.invoke("app:shouldRestoreSession"),
  checkForUpdates: (): Promise<UpdateInfo> =>
    ipcRenderer.invoke("app:checkForUpdates"),
  // The renderer can request updater actions, but it still cannot touch
  // electron-updater directly. Keeping these as IPC calls means download,
  // install, and restart control stay in the main process where Electron
  // expects them, while React only renders state and user intent.
  getUpdateInstallState: (): Promise<UpdateInstallState> =>
    ipcRenderer.invoke("app:getUpdateInstallState"),
  downloadUpdate: (): Promise<UpdateActionResult> =>
    ipcRenderer.invoke("app:downloadUpdate"),
  installUpdate: (): Promise<UpdateActionResult> =>
    ipcRenderer.invoke("app:installUpdate"),
  openUpdatePage: (releaseUrl?: string) =>
    ipcRenderer.invoke("app:openUpdatePage", releaseUrl),
  getHtmlPreviewTarget: (
    filePath: string,
    folderPath?: string | null,
  ): Promise<HtmlPreviewActionResult> =>
    ipcRenderer.invoke("htmlPreview:getTarget", filePath, folderPath),
  openHtmlPreviewInBrowser: (
    filePath: string,
    folderPath?: string | null,
  ): Promise<HtmlPreviewActionResult> =>
    ipcRenderer.invoke("htmlPreview:openExternal", filePath, folderPath),
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
  onTaskOutput: (callback: (event: TaskOutputEvent) => void) => {
    const handler = (_: unknown, event: TaskOutputEvent) => callback(event);
    ipcRenderer.on("task:output", handler);
    return () => ipcRenderer.removeListener("task:output", handler);
  },
  onTaskFinished: (callback: (event: TaskFinishedEvent) => void) => {
    const handler = (_: unknown, event: TaskFinishedEvent) => callback(event);
    ipcRenderer.on("task:finished", handler);
    return () => ipcRenderer.removeListener("task:finished", handler);
  },

  // Updater events can happen after the modal closes or before it opens. This
  // subscription gives App a single source of truth so any update surface can
  // render the current phase without polling or duplicating updater logic.
  onUpdateState: (callback: (state: UpdateInstallState) => void) => {
    const handler = (_: unknown, state: UpdateInstallState) => callback(state);
    ipcRenderer.on("app:updateState", handler);
    return () => ipcRenderer.removeListener("app:updateState", handler);
  },

  onHtmlPreviewChanged: (
    callback: (event: { path: string; serverId: string | null }) => void,
  ) => {
    const handler = (
      _: unknown,
      event: { path: string; serverId: string | null },
    ) => callback(event);
    ipcRenderer.on("htmlPreview:changed", handler);
    return () => ipcRenderer.removeListener("htmlPreview:changed", handler);
  },

  onHtmlPreviewConsole: (callback: (event: HtmlPreviewConsoleEvent) => void) => {
    const handler = (_: unknown, event: HtmlPreviewConsoleEvent) =>
      callback(event);
    ipcRenderer.on("htmlPreview:console", handler);
    return () => ipcRenderer.removeListener("htmlPreview:console", handler);
  },

  onMenuCommand: (callback: (command: AxonCommand) => void) => {
    const handler = (_: unknown, command: AxonCommand) => callback(command);
    ipcRenderer.on("menu:command", handler);
    return () => ipcRenderer.removeListener("menu:command", handler);
  },
});
