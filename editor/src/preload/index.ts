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
  type GitCommitResult,
  type GitCommitDiffResult,
  type GitDiffResult,
  type GitHistoryResult,
  type GitStatusResult,
} from "../shared/git";
import {
  type TaskFinishedEvent,
  type TaskOutputEvent,
  type TaskRunResult,
  type WorkspaceTask,
} from "../shared/tasks";
import {
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerDefinitionRequest,
  type LanguageServerDefinitionResult,
  type LanguageServerDocumentSyncRequest,
  type LanguageServerFormatRequest,
  type LanguageServerFormatResult,
  type LanguageServerHoverRequest,
  type LanguageServerHoverResult,
  type LanguageServerLifecycleResult,
  type LanguageServerReferencesRequest,
  type LanguageServerReferencesResult,
  type LanguageServerRenameRequest,
  type LanguageServerRenameResult,
  type LanguageServerSignatureHelpRequest,
  type LanguageServerSignatureHelpResult,
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
import {
  type ExtensionActionResult,
  type ExtensionState,
} from "../shared/extensions";
import type {
  SpotifyActionResult,
  SpotifyAuthResult,
  SpotifyPlaybackResult,
  SpotifyPlaylistsResult,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
} from "../shared/spotify";

contextBridge.exposeInMainWorld("axon", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  importFont: (): Promise<CustomFont | null> =>
    ipcRenderer.invoke("dialog:importFont"),
  selectPythonVirtualEnv: (): Promise<{
    virtualEnvPath: string;
    interpreterPath: string;
  } | null> => ipcRenderer.invoke("dialog:selectPythonVirtualEnv"),
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
  syncLanguageServerDocument: (
    request: LanguageServerDocumentSyncRequest,
  ): Promise<void> => ipcRenderer.invoke("lsp:syncDocument", request),
  getLanguageServerHover: (
    request: LanguageServerHoverRequest,
  ): Promise<LanguageServerHoverResult> =>
    ipcRenderer.invoke("lsp:hover", request),
  getLanguageServerDefinitions: (
    request: LanguageServerDefinitionRequest,
  ): Promise<LanguageServerDefinitionResult> =>
    ipcRenderer.invoke("lsp:definition", request),
  getLanguageServerReferences: (
    request: LanguageServerReferencesRequest,
  ): Promise<LanguageServerReferencesResult> =>
    ipcRenderer.invoke("lsp:references", request),
  renameLanguageServerSymbol: (
    request: LanguageServerRenameRequest,
  ): Promise<LanguageServerRenameResult> =>
    ipcRenderer.invoke("lsp:rename", request),
  formatLanguageServerDocument: (
    request: LanguageServerFormatRequest,
  ): Promise<LanguageServerFormatResult> =>
    ipcRenderer.invoke("lsp:format", request),
  getLanguageServerSignatureHelp: (
    request: LanguageServerSignatureHelpRequest,
  ): Promise<LanguageServerSignatureHelpResult> =>
    ipcRenderer.invoke("lsp:signatureHelp", request),
  getLanguageServerCodeActions: (
    request: LanguageServerCodeActionRequest,
  ): Promise<LanguageServerCodeActionResult> =>
    ipcRenderer.invoke("lsp:codeActions", request),
  onLanguageServerDiagnostics: (
    callback: (event: {
      folderPath: string;
      filePath: string;
      diagnostics: EditorDiagnostic[];
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        folderPath: string;
        filePath: string;
        diagnostics: EditorDiagnostic[];
      },
    ) => callback(payload);
    ipcRenderer.on("lsp:diagnostics", listener);
    return () => ipcRenderer.removeListener("lsp:diagnostics", listener);
  },
  onLanguageServerLog: (
    callback: (event: {
      folderPath: string;
      serverId: string;
      level: "info" | "error";
      message: string;
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        folderPath: string;
        serverId: string;
        level: "info" | "error";
        message: string;
      },
    ) => callback(payload);
    ipcRenderer.on("lsp:log", listener);
    return () => ipcRenderer.removeListener("lsp:log", listener);
  },
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
  getGitHistory: (
    folderPath: string,
    filePath?: string | null,
  ): Promise<GitHistoryResult> =>
    ipcRenderer.invoke("git:history", folderPath, filePath),
  getGitCommitDiff: (
    folderPath: string,
    hash: string,
    filePath?: string | null,
  ): Promise<GitCommitDiffResult> =>
    ipcRenderer.invoke("git:commitDiff", folderPath, hash, filePath),
  runGitAction: (
    folderPath: string,
    filePath: string,
    action: "stage" | "unstage" | "discard",
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:action", folderPath, filePath, action),
  commitGitChanges: (
    folderPath: string,
    message: string,
  ): Promise<GitCommitResult> =>
    ipcRenderer.invoke("git:commit", folderPath, message),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  listExtensions: (folderPath?: string | null): Promise<ExtensionState> =>
    ipcRenderer.invoke("extensions:list", folderPath),
  setExtensionEnabled: (
    extensionId: string,
    enabled: boolean,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(
      "extensions:setEnabled",
      extensionId,
      enabled,
      folderPath,
    ),
  reloadExtensions: (
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke("extensions:reload", folderPath),
  openExtensionsFolder: (
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke("extensions:openFolder", folderPath),
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
  openExternalLink: (href: string): Promise<void> =>
    ipcRenderer.invoke("shell:openExternal", href),
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

  onHtmlPreviewConsole: (
    callback: (event: HtmlPreviewConsoleEvent) => void,
  ) => {
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

  spotify: {
    auth: (): Promise<SpotifyAuthResult> => ipcRenderer.invoke("spotify:auth"),
    disconnect: (): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:disconnect"),
    getStatus: (): Promise<SpotifyStatusResult> =>
      ipcRenderer.invoke("spotify:status"),
    getPlaylists: (): Promise<SpotifyPlaylistsResult> =>
      ipcRenderer.invoke("spotify:playlists"),
    getPlaylistTracks: (
      playlistId: string,
      offset: number,
    ): Promise<{
      ok: boolean;
      items: unknown[];
      total: number;
      next: string | null;
    }> => ipcRenderer.invoke("spotify:playlistTracks", playlistId, offset),
    getPlaybackState: (): Promise<SpotifyPlaybackResult> =>
      ipcRenderer.invoke("spotify:playbackState"),
    play: (request: SpotifyPlayTrackRequest): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:play", request),
    pause: (): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:pause"),
    next: (): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:next"),
    previous: (): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:previous"),
    seek: (positionMs: number): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:seek", positionMs),
    setVolume: (volumePercent: number): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:setVolume", volumePercent),
    setShuffle: (state: boolean): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:setShuffle", state),
    setRepeat: (
      state: "off" | "track" | "context",
    ): Promise<SpotifyActionResult> =>
      ipcRenderer.invoke("spotify:setRepeat", state),
    onConnected: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("spotify:connected", handler);
      // Return cleanup so React useEffect can remove the listener on unmount.
      return () => ipcRenderer.removeListener("spotify:connected", handler);
    },
  },
});
