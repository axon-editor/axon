// Exposes a controlled API surface to the renderer via contextBridge.
// The renderer never gets direct Node.js access, only what is explicitly
// defined here. fs.onFileChanged uses ipcRenderer.on so the main process
// can push file change events to the renderer without polling.

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { type AxonSettings, type CustomFont } from "../shared/settings";
import { type AxonCommand } from "../shared/commands";
import {
  type AgentResumeRequest,
  type CliToolInstallResult,
  type CliToolStatus,
} from "../shared/app";
import {
  type AiChatRequest,
  type AiChatResult,
  type AiChatStreamEvent,
  type AiChatStreamStarted,
  type AiModelInfo,
  type AiProjectContext,
  type AiPullEvent,
  type AiPullStarted,
  type AiRuntimeStatus,
} from "../shared/ai";
import { type EditorDiagnostic } from "../shared/diagnostics";
import {
  type GitActionResult,
  type GitBranchAction,
  type GitBranchListResult,
  type GitConflictListResult,
  type GitConflictResolution,
  type GitCommitResult,
  type GitCommitDiffResult,
  type GitDiffResult,
  type GitGraphResult,
  type GitHistoryResult,
  type GitStashAction,
  type GitStashListResult,
  type GitStatusResult,
  type GitWorktreeAction,
  type GitWorktreeListResult,
} from "../shared/git";
import {
  type TaskFinishedEvent,
  type TaskOutputEvent,
  type TaskRunResult,
  type WorkspaceTask,
} from "../shared/tasks";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestOutputEvent,
  type TestRunResult,
  type TestStopResult,
} from "../shared/tests";
import {
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerDefinitionRequest,
  type LanguageServerDefinitionResult,
  type LanguageServerDocumentSyncRequest,
  type LanguageServerExecuteCommandRequest,
  type LanguageServerExecuteCommandResult,
  type LanguageServerFormatRequest,
  type LanguageServerFormatResult,
  type LanguageServerHoverRequest,
  type LanguageServerHoverResult,
  type LanguageServerLifecycleResult,
  type LanguageServerReferencesRequest,
  type LanguageServerReferencesResult,
  type LanguageServerRenameRequest,
  type LanguageServerRenameResult,
  type LanguageServerSemanticTokensRequest,
  type LanguageServerSemanticTokensResult,
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
  type ExtensionCommandExecutionResult,
  type ExtensionMarketplaceState,
  type ExtensionState,
} from "../shared/extensions";
import type {
  SpotifyActionResult,
  SpotifyAuthResult,
  SpotifyDevicesResult,
  SpotifyPlaybackResult,
  SpotifyPlaylistsResult,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
} from "../shared/spotify";

const EXTENSION_IPC_CHANNELS = {
  list: "extensions:list",
  activate: "extensions:activate",
  setEnabled: "extensions:setEnabled",
  reload: "extensions:reload",
  marketplace: "extensions:marketplace",
  themeMarketplace: "extensions:themeMarketplace",
  install: "extensions:install",
  installTheme: "extensions:installTheme",
  openFolder: "extensions:openFolder",
  executeCommand: "extensions:executeCommand",
} as const;

contextBridge.exposeInMainWorld("axon", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  getCliToolStatus: (): Promise<CliToolStatus> =>
    ipcRenderer.invoke("app:getCliToolStatus"),
  installCliTool: (): Promise<CliToolInstallResult> =>
    ipcRenderer.invoke("app:installCliTool"),
  getAgentResumeRequest: (): Promise<AgentResumeRequest | null> =>
    ipcRenderer.invoke("app:getAgentResumeRequest"),
  saveAgentResumeRequest: (request: AgentResumeRequest): Promise<boolean> =>
    ipcRenderer.invoke("app:saveAgentResumeRequest", request),
  onAgentResumeRequest: (callback: (request: AgentResumeRequest) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: AgentResumeRequest,
    ) => callback(request);

    ipcRenderer.on("agent:resumeRequest", listener);
    return () => ipcRenderer.removeListener("agent:resumeRequest", listener);
  },
  onCliOpenFolder: (callback: (folderPath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, folderPath: string) =>
      callback(folderPath);

    ipcRenderer.on("cli:open-folder", listener);
    return () => ipcRenderer.removeListener("cli:open-folder", listener);
  },
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
  getSettings: (folderPath?: string | null) =>
    ipcRenderer.invoke("settings:get", folderPath),
  updateSettings: (settings: AxonSettings, folderPath?: string | null) =>
    ipcRenderer.invoke("settings:update", settings, folderPath),
  ensureSettingsFile: (folderPath?: string | null, settings?: AxonSettings) =>
    ipcRenderer.invoke("settings:ensureFile", folderPath, settings),
  getProjectDiagnostics: (folderPath: string): Promise<EditorDiagnostic[]> =>
    ipcRenderer.invoke("diagnostics:project", folderPath),
  exportAgentDiagnostics: (snapshot: {
    workspace: string;
    updatedAt: string;
    diagnostics: EditorDiagnostic[];
  }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("diagnostics:exportAgent", snapshot),
  listAiModels: (folderPath?: string | null): Promise<AiModelInfo[]> =>
    ipcRenderer.invoke("ai:listModels", folderPath),
  getAiProjectContext: (folderPath: string): Promise<AiProjectContext> =>
    ipcRenderer.invoke("ai:getProjectContext", folderPath),
  getAiRuntimeStatus: (folderPath?: string | null): Promise<AiRuntimeStatus> =>
    ipcRenderer.invoke("ai:getRuntimeStatus", folderPath),
  runAiChat: (request: AiChatRequest): Promise<AiChatResult> =>
    ipcRenderer.invoke("ai:chat", request),
  runAiChatStream: (request: AiChatRequest): Promise<AiChatStreamStarted> =>
    ipcRenderer.invoke("ai:chatStream", request),
  cancelAiChatStream: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke("ai:cancelChatStream", requestId),
  pullAiModel: (model: string): Promise<AiPullStarted> =>
    ipcRenderer.invoke("ai:pullModel", model),
  cancelAiModelPull: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke("ai:cancelPullModel", requestId),
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
  getLanguageServerSemanticTokens: (
    request: LanguageServerSemanticTokensRequest,
  ): Promise<LanguageServerSemanticTokensResult> =>
    ipcRenderer.invoke("lsp:semanticTokens", request),
  getLanguageServerCodeActions: (
    request: LanguageServerCodeActionRequest,
  ): Promise<LanguageServerCodeActionResult> =>
    ipcRenderer.invoke("lsp:codeActions", request),
  executeLanguageServerCommand: (
    request: LanguageServerExecuteCommandRequest,
  ): Promise<LanguageServerExecuteCommandResult> =>
    ipcRenderer.invoke("lsp:executeCommand", request),
  onLanguageServerDiagnostics: (
    callback: (event: {
      folderPath: string;
      filePath: string;
      serverId: string;
      diagnostics: EditorDiagnostic[];
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        folderPath: string;
        filePath: string;
        serverId: string;
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
  discoverTests: (folderPath: string): Promise<TestDiscoveryResult> =>
    ipcRenderer.invoke("tests:discover", folderPath),
  runTests: (
    folderPath: string,
    providerId: string,
    targetId?: string | null,
  ): Promise<TestRunResult> =>
    ipcRenderer.invoke("tests:run", folderPath, providerId, targetId),
  stopTests: (): Promise<TestStopResult> => ipcRenderer.invoke("tests:stopAll"),
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
    oldPath?: string | null,
  ): Promise<GitCommitDiffResult> =>
    ipcRenderer.invoke("git:commitDiff", folderPath, hash, filePath, oldPath),
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
  listGitBranches: (folderPath: string): Promise<GitBranchListResult> =>
    ipcRenderer.invoke("git:branches", folderPath),
  runGitBranchAction: (
    folderPath: string,
    action: GitBranchAction,
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:branchAction", folderPath, action),
  listGitStashes: (folderPath: string): Promise<GitStashListResult> =>
    ipcRenderer.invoke("git:stashes", folderPath),
  runGitStashAction: (
    folderPath: string,
    action: GitStashAction,
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:stashAction", folderPath, action),
  listGitConflicts: (folderPath: string): Promise<GitConflictListResult> =>
    ipcRenderer.invoke("git:conflicts", folderPath),
  resolveGitConflict: (
    folderPath: string,
    resolution: GitConflictResolution,
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:resolveConflict", folderPath, resolution),
  listGitWorktrees: (folderPath: string): Promise<GitWorktreeListResult> =>
    ipcRenderer.invoke("git:worktrees", folderPath),
  runGitWorktreeAction: (
    folderPath: string,
    action: GitWorktreeAction,
  ): Promise<GitActionResult> =>
    ipcRenderer.invoke("git:worktreeAction", folderPath, action),
  getGitGraph: (folderPath: string): Promise<GitGraphResult> =>
    ipcRenderer.invoke("git:graph", folderPath),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  listExtensions: (folderPath?: string | null): Promise<ExtensionState> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.list, folderPath),
  activateExtensionEvent: (
    activationEvent: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(
      EXTENSION_IPC_CHANNELS.activate,
      activationEvent,
      folderPath,
    ),
  executeExtensionCommand: (
    commandId: string,
    args?: unknown[],
    folderPath?: string | null,
  ): Promise<ExtensionCommandExecutionResult> =>
    ipcRenderer.invoke(
      EXTENSION_IPC_CHANNELS.executeCommand,
      commandId,
      args ?? [],
      folderPath,
    ),
  setExtensionEnabled: (
    extensionId: string,
    enabled: boolean,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(
      EXTENSION_IPC_CHANNELS.setEnabled,
      extensionId,
      enabled,
      folderPath,
    ),
  reloadExtensions: (
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.reload, folderPath),
  openExtensionsFolder: (
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.openFolder, folderPath),
  listExtensionMarketplace: (): Promise<ExtensionMarketplaceState> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.marketplace),
  installExtension: (
    extensionId: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.install, extensionId, folderPath),
  listThemeMarketplace: (): Promise<ExtensionMarketplaceState> =>
    ipcRenderer.invoke(EXTENSION_IPC_CHANNELS.themeMarketplace),
  installThemeExtension: (
    extensionId: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> =>
    ipcRenderer.invoke(
      EXTENSION_IPC_CHANNELS.installTheme,
      extensionId,
      folderPath,
    ),
  shouldRestoreSession: (): Promise<boolean> =>
    ipcRenderer.invoke("app:shouldRestoreSession"),
  consumeCliOpenFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("app:consumeCliOpenFolder"),
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
  getDroppedFilePaths: (files: File[]): string[] =>
    files
      .map((file) => webUtils.getPathForFile(file))
      .filter((path) => path.length > 0),
  importExternalEntries: (
    sourcePaths: string[],
    targetDir: string,
  ): Promise<
    Array<{ sourcePath: string; targetPath: string; isDir: boolean }>
  > => ipcRenderer.invoke("fs:importEntries", sourcePaths, targetDir),
  watchFile: (path: string) => ipcRenderer.invoke("fs:watch", path),
  unwatchFile: () => ipcRenderer.invoke("fs:unwatch"),
  watchFolder: (path: string) => ipcRenderer.invoke("fs:watchFolder", path),
  unwatchFolder: () => ipcRenderer.invoke("fs:unwatchFolder"),
  listProjectFiles: (
    folderPath: string,
  ): Promise<Array<{ name: string; path: string; is_dir: false }>> =>
    ipcRenderer.invoke("fs:listProjectFiles", folderPath),

  onFileChanged: (
    callback: (data: { path: string; content: string }) => void,
  ) => {
    const handler = (_: unknown, data: { path: string; content: string }) =>
      callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },

  // notifies renderer when any file is created, deleted, or renamed in the folder
  onFolderChanged: (callback: (data?: { path?: string }) => void) => {
    const handler = (_: unknown, data?: { path?: string }) => callback(data);
    ipcRenderer.on("fs:folderChanged", handler);
    return () => ipcRenderer.removeListener("fs:folderChanged", handler);
  },
  onGitChanged: (callback: (event?: { folderPath?: string }) => void) => {
    const handler = (_: unknown, event?: { folderPath?: string }) =>
      callback(event);
    ipcRenderer.on("git:changed", handler);
    return () => ipcRenderer.removeListener("git:changed", handler);
  },
  onAiChatStreamEvent: (callback: (event: AiChatStreamEvent) => void) => {
    const handler = (_: unknown, event: AiChatStreamEvent) => callback(event);
    ipcRenderer.on("ai:chatStreamEvent", handler);
    return () => ipcRenderer.removeListener("ai:chatStreamEvent", handler);
  },
  onAiPullEvent: (callback: (event: AiPullEvent) => void) => {
    const handler = (_: unknown, event: AiPullEvent) => callback(event);
    ipcRenderer.on("ai:pullEvent", handler);
    return () => ipcRenderer.removeListener("ai:pullEvent", handler);
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
  onTestOutput: (callback: (event: TestOutputEvent) => void) => {
    const handler = (_: unknown, event: TestOutputEvent) => callback(event);
    ipcRenderer.on("tests:output", handler);
    return () => ipcRenderer.removeListener("tests:output", handler);
  },
  onTestFinished: (callback: (event: TestFinishedEvent) => void) => {
    const handler = (_: unknown, event: TestFinishedEvent) => callback(event);
    ipcRenderer.on("tests:finished", handler);
    return () => ipcRenderer.removeListener("tests:finished", handler);
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
    getDevices: (): Promise<SpotifyDevicesResult> =>
      ipcRenderer.invoke("spotify:devices"),
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
