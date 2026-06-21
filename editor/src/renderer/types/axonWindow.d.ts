import type { AxonCommand } from "../../shared/commands";
import type { EditorDiagnostic } from "../features/diagnostics/lib/diagnostics";
import type {
  ExtensionActionResult,
  ExtensionState,
} from "../../shared/extensions";
import type {
  GitActionResult,
  GitBranchAction,
  GitBranchListResult,
  GitConflictListResult,
  GitConflictResolution,
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitGraphResult,
  GitHistoryResult,
  GitStashAction,
  GitStashListResult,
  GitStatusResult,
  GitWorktreeAction,
  GitWorktreeListResult,
} from "../../shared/git";
import type {
  HtmlPreviewActionResult,
  HtmlPreviewConsoleEvent,
} from "../../shared/htmlPreview";
import type {
  LanguageServerCodeActionRequest,
  LanguageServerCodeActionResult,
  LanguageServerCompletionRequest,
  LanguageServerCompletionResult,
  LanguageServerDefinitionRequest,
  LanguageServerDefinitionResult,
  LanguageServerDocumentSyncRequest,
  LanguageServerExecuteCommandRequest,
  LanguageServerExecuteCommandResult,
  LanguageServerFormatRequest,
  LanguageServerFormatResult,
  LanguageServerHoverRequest,
  LanguageServerHoverResult,
  LanguageServerLifecycleResult,
  LanguageServerReferencesRequest,
  LanguageServerReferencesResult,
  LanguageServerRenameRequest,
  LanguageServerRenameResult,
  LanguageServerSignatureHelpRequest,
  LanguageServerSignatureHelpResult,
  LanguageServerStartForFileRequest,
  LanguageServerStatus,
} from "../../shared/lsp";
import type {
  SpotifyActionResult,
  SpotifyAuthResult,
  SpotifyDevicesResult,
  SpotifyPlaybackResult,
  SpotifyPlaylistsResult,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
} from "../../shared/spotify";
import type { AxonSettings, CustomFont } from "../../shared/settings";
import type {
  TaskFinishedEvent,
  TaskOutputEvent,
  TaskRunResult,
  WorkspaceTask,
} from "../../shared/tasks";
import type {
  TestDiscoveryResult,
  TestFinishedEvent,
  TestOutputEvent,
  TestRunResult,
} from "../../shared/tests";
import type {
  UpdateActionResult,
  UpdateInfo,
  UpdateInstallState,
} from "../../shared/updates";
import type { AppInfo } from "../shared/components/AboutModal";
import type {
  AiChatRequest,
  AiChatResult,
  AiChatStreamEvent,
  AiChatStreamStarted,
  AiModelInfo,
  AiProjectContext,
  AiPullEvent,
  AiPullStarted,
  AiRuntimeStatus,
} from "../../shared/ai";

declare global {
  interface Window {
    axonCompletionWorkspacePath?: string | null;
    axonEditorSettings?: AxonSettings;
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      importFont: () => Promise<CustomFont | null>;
      listAvailableFonts: () => Promise<CustomFont[]>;
      selectEditorBackgroundImage: () => Promise<string | null>;
      selectPythonVirtualEnv: (folderPath?: string | null) => Promise<{
        virtualEnvPath: string;
        interpreterPath: string;
      } | null>;
      getSettings: (folderPath?: string | null) => Promise<AxonSettings>;
      updateSettings: (
        settings: AxonSettings,
        folderPath?: string | null,
      ) => Promise<AxonSettings>;
      ensureSettingsFile: (
        folderPath?: string | null,
        settings?: AxonSettings,
      ) => Promise<string>;
      getProjectDiagnostics: (
        folderPath: string,
      ) => Promise<EditorDiagnostic[]>;
      exportAgentDiagnostics: (snapshot: {
        workspace: string;
        updatedAt: string;
        diagnostics: EditorDiagnostic[];
      }) => Promise<{ ok: boolean }>;
      listAiModels: (folderPath?: string | null) => Promise<AiModelInfo[]>;
      getAiProjectContext: (folderPath: string) => Promise<AiProjectContext>;
      getAiRuntimeStatus: (
        folderPath?: string | null,
      ) => Promise<AiRuntimeStatus>;
      runAiChat: (request: AiChatRequest) => Promise<AiChatResult>;
      runAiChatStream: (
        request: AiChatRequest,
      ) => Promise<AiChatStreamStarted>;
      cancelAiChatStream: (requestId: string) => Promise<boolean>;
      pullAiModel: (model: string) => Promise<AiPullStarted>;
      cancelAiModelPull: (requestId: string) => Promise<boolean>;
      getLanguageServerStatus: (
        folderPath: string,
      ) => Promise<LanguageServerStatus[]>;
      startLanguageServers: (
        folderPath: string,
      ) => Promise<LanguageServerLifecycleResult>;
      startLanguageServerForLanguage: (
        request: LanguageServerStartForFileRequest,
      ) => Promise<LanguageServerLifecycleResult>;
      stopLanguageServers: (
        folderPath: string,
      ) => Promise<LanguageServerLifecycleResult>;
      getLanguageServerCompletions: (
        request: LanguageServerCompletionRequest,
      ) => Promise<LanguageServerCompletionResult>;
      syncLanguageServerDocument: (
        request: LanguageServerDocumentSyncRequest,
      ) => Promise<void>;
      getLanguageServerHover: (
        request: LanguageServerHoverRequest,
      ) => Promise<LanguageServerHoverResult>;
      getLanguageServerDefinitions: (
        request: LanguageServerDefinitionRequest,
      ) => Promise<LanguageServerDefinitionResult>;
      getLanguageServerReferences: (
        request: LanguageServerReferencesRequest,
      ) => Promise<LanguageServerReferencesResult>;
      renameLanguageServerSymbol: (
        request: LanguageServerRenameRequest,
      ) => Promise<LanguageServerRenameResult>;
      formatLanguageServerDocument: (
        request: LanguageServerFormatRequest,
      ) => Promise<LanguageServerFormatResult>;
      getLanguageServerSignatureHelp: (
        request: LanguageServerSignatureHelpRequest,
      ) => Promise<LanguageServerSignatureHelpResult>;
      getLanguageServerCodeActions: (
        request: LanguageServerCodeActionRequest,
      ) => Promise<LanguageServerCodeActionResult>;
      executeLanguageServerCommand: (
        request: LanguageServerExecuteCommandRequest,
      ) => Promise<LanguageServerExecuteCommandResult>;
      onLanguageServerDiagnostics: (
        callback: (event: {
          folderPath: string;
          filePath: string;
          diagnostics: EditorDiagnostic[];
        }) => void,
      ) => () => void;
      onLanguageServerLog: (
        callback: (event: {
          folderPath: string;
          serverId: string;
          level: "info" | "error";
          message: string;
        }) => void,
      ) => () => void;
      listWorkspaceTasks: (folderPath: string) => Promise<WorkspaceTask[]>;
      runWorkspaceTask: (
        folderPath: string,
        taskId: string,
      ) => Promise<TaskRunResult>;
      discoverTests: (folderPath: string) => Promise<TestDiscoveryResult>;
      runTests: (
        folderPath: string,
        providerId: string,
        targetId?: string | null,
      ) => Promise<TestRunResult>;
      getGitStatus: (folderPath: string) => Promise<GitStatusResult>;
      getGitDiff: (
        folderPath: string,
        filePath: string,
        staged?: boolean,
        untracked?: boolean,
      ) => Promise<GitDiffResult>;
      getGitFileBase: (folderPath: string, filePath: string) => Promise<string>;
      getGitHistory: (
        folderPath: string,
        filePath?: string | null,
      ) => Promise<GitHistoryResult>;
      getGitCommitDiff: (
        folderPath: string,
        hash: string,
        filePath?: string | null,
        oldPath?: string | null,
      ) => Promise<GitCommitDiffResult>;
      runGitAction: (
        folderPath: string,
        filePath: string,
        action: "stage" | "unstage" | "discard",
      ) => Promise<GitActionResult>;
      commitGitChanges: (
        folderPath: string,
        message: string,
      ) => Promise<GitCommitResult>;
      listGitBranches: (folderPath: string) => Promise<GitBranchListResult>;
      runGitBranchAction: (
        folderPath: string,
        action: GitBranchAction,
      ) => Promise<GitActionResult>;
      listGitStashes: (folderPath: string) => Promise<GitStashListResult>;
      runGitStashAction: (
        folderPath: string,
        action: GitStashAction,
      ) => Promise<GitActionResult>;
      listGitConflicts: (folderPath: string) => Promise<GitConflictListResult>;
      resolveGitConflict: (
        folderPath: string,
        resolution: GitConflictResolution,
      ) => Promise<GitActionResult>;
      listGitWorktrees: (folderPath: string) => Promise<GitWorktreeListResult>;
      runGitWorktreeAction: (
        folderPath: string,
        action: GitWorktreeAction,
      ) => Promise<GitActionResult>;
      getGitGraph: (folderPath: string) => Promise<GitGraphResult>;
      getAppInfo: () => Promise<AppInfo>;
      listExtensions: (folderPath?: string | null) => Promise<ExtensionState>;
      setExtensionEnabled: (
        extensionId: string,
        enabled: boolean,
        folderPath?: string | null,
      ) => Promise<ExtensionActionResult>;
      reloadExtensions: (
        folderPath?: string | null,
      ) => Promise<ExtensionActionResult>;
      openExtensionsFolder: (
        folderPath?: string | null,
      ) => Promise<ExtensionActionResult>;
      shouldRestoreSession: () => Promise<boolean>;
      checkForUpdates: () => Promise<UpdateInfo>;
      getUpdateInstallState: () => Promise<UpdateInstallState>;
      downloadUpdate: () => Promise<UpdateActionResult>;
      installUpdate: () => Promise<UpdateActionResult>;
      openUpdatePage: (releaseUrl?: string) => Promise<void>;
      openExternalLink: (href: string) => Promise<void>;
      getHtmlPreviewTarget: (
        filePath: string,
        folderPath?: string | null,
      ) => Promise<HtmlPreviewActionResult>;
      openHtmlPreviewInBrowser: (
        filePath: string,
        folderPath?: string | null,
      ) => Promise<HtmlPreviewActionResult>;
      copyText: (text: string) => Promise<void>;
      getDroppedFilePaths: (files: File[]) => string[];
      importExternalEntries: (
        sourcePaths: string[],
        targetDir: string,
      ) => Promise<
        Array<{ sourcePath: string; targetPath: string; isDir: boolean }>
      >;
      watchFile: (path: string) => Promise<void>;
      unwatchFile: () => Promise<void>;
      watchFolder: (path: string) => Promise<void>;
      unwatchFolder: () => Promise<void>;
      listProjectFiles: (
        folderPath: string,
      ) => Promise<Array<{ name: string; path: string; is_dir: false }>>;
      onFileChanged: (
        callback: (data: { path: string; content: string }) => void,
      ) => () => void;
      onFolderChanged: (callback: () => void) => () => void;
      onGitChanged: (callback: () => void) => () => void;
      onAiChatStreamEvent: (
        callback: (event: AiChatStreamEvent) => void,
      ) => () => void;
      onAiPullEvent: (callback: (event: AiPullEvent) => void) => () => void;
      onTaskOutput: (callback: (event: TaskOutputEvent) => void) => () => void;
      onTaskFinished: (
        callback: (event: TaskFinishedEvent) => void,
      ) => () => void;
      onTestOutput: (callback: (event: TestOutputEvent) => void) => () => void;
      onTestFinished: (
        callback: (event: TestFinishedEvent) => void,
      ) => () => void;
      onUpdateState: (
        callback: (state: UpdateInstallState) => void,
      ) => () => void;
      onHtmlPreviewChanged: (
        callback: (event: { path: string; serverId: string | null }) => void,
      ) => () => void;
      onHtmlPreviewConsole: (
        callback: (event: HtmlPreviewConsoleEvent) => void,
      ) => () => void;
      onMenuCommand: (callback: (command: AxonCommand) => void) => () => void;
      spotify: {
        auth: () => Promise<SpotifyAuthResult>;
        disconnect: () => Promise<SpotifyActionResult>;
        getStatus: () => Promise<SpotifyStatusResult>;
        getPlaylists: () => Promise<SpotifyPlaylistsResult>;
        getPlaylistTracks: (
          playlistId: string,
          offset: number,
        ) => Promise<{
          ok: boolean;
          items: unknown[];
          total: number;
          next: string | null;
        }>;
        getPlaybackState: () => Promise<SpotifyPlaybackResult>;
        getDevices: () => Promise<SpotifyDevicesResult>;
        play: (request: SpotifyPlayTrackRequest) => Promise<SpotifyActionResult>;
        pause: () => Promise<SpotifyActionResult>;
        next: () => Promise<SpotifyActionResult>;
        previous: () => Promise<SpotifyActionResult>;
        seek: (positionMs: number) => Promise<SpotifyActionResult>;
        setVolume: (v: number) => Promise<SpotifyActionResult>;
        setShuffle: (state: boolean) => Promise<SpotifyActionResult>;
        setRepeat: (
          state: "off" | "track" | "context",
        ) => Promise<SpotifyActionResult>;
        onConnected: (callback: () => void) => () => void;
      };
    };
  }
}

export {};
