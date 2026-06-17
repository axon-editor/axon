import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Sidebar, { addRecentFolder } from "./features/sidebar";
import EditorPane from "./features/editor/EditorPane";
import StatusBar from "./shared/components/StatusBar";
import Terminal from "./features/terminal/Terminal";
import CommandPalette, {
  type CommandPaletteCommand,
} from "./features/search/CommandPalette";
import WorkspaceSearchModal from "./features/search/WorkspaceSearchModal";
import {
  type BottomPanelTab,
  type OutputEntry,
  type OutputEntryLevel,
} from "./features/terminal/BottomPanel";
import DiffModal from "./features/git/DiffModal";
import EditorToolbar from "./features/editor/EditorToolbar";
import SettingsModal from "./features/settings";
import ExtensionsModal from "./features/extensions";
import SplashScreen from "./shared/components/SplashScreen";
import AboutModal, { type AppInfo } from "./shared/components/AboutModal";
import SourceControlModal from "./features/git/SourceControlModal";
import TaskRunnerModal from "./features/tasks/TaskRunnerModal";
import FileOutlineModal from "./features/search/FileOutlineModal";
import UpdateModal from "./features/updates/UpdateModal";
import GitHistoryEditor from "./features/git/GitHistoryEditor";
import { useSpotify } from "./features/spotify/lib/useSpotify";
import WorkspaceLoadingOverlay from "./shared/components/WorkspaceLoadingOverlay";
import {
  getTree,
  createFile,
  writeFile,
  type FileNode,
  type WorkspaceSearchResult,
} from "./shared/lib/api";
import {
  clearLanguageServerDiagnosticsFromMonaco,
  onEditorDiagnosticsChanged,
  syncLanguageServerDiagnosticsToMonaco,
  type EditorDiagnostic,
} from "./features/diagnostics/lib/diagnostics";
import {
  createInitialLayout,
  splitPane,
  openFileInPane,
  closeTabInPane,
  closePane,
  reorderTabsInPane,
  setActivePaneFile,
  setDirtyInPane,
  moveTabBetweenPanes,
  removePathFromLayout,
  replacePathInLayout,
  setPinnedInPane,
} from "./features/editor/lib/layoutManager";
import { type Layout, type SplitDirection } from "./features/editor/lib/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../shared/commands";
import {
  type GitActionResult,
  type GitCommitResult,
  type GitCommitDiffResult,
  type GitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
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
import { createThemeCssVariables, resolveThemeTokens } from "./shared/lib/themeTokens";
import { registerAxonTheme } from "./shared/lib/soraTheme";
import { type EditorNavigationTarget } from "./features/editor/lib/navigation";
import { fontStack } from "./shared/lib/fonts";
import { createBundledFontFaces } from "./shared/lib/bundledFonts";
import { createHtmlPreviewTabPath, isHtmlFile } from "./features/preview/lib/htmlPreviewTabs";
import {
  loadWorkspaceSession,
  sanitizeRestoredLayout,
  saveWorkspaceSession,
  type WorkspaceSession,
} from "./shared/lib/workspaceSession";
import { detectLanguage, getModel } from "./features/editor/lib/monacoModels";
import { collectFileSymbols, type FileSymbol } from "./features/sidebar/files/lib/fileSymbols";
import "./App.css";
import * as monaco from "monaco-editor";
import SpotifyPanel from "./features/spotify/SpotifyPanel";
import SpotifyFloatingPlayer from "./features/spotify/SpotifyFloatingPlayer";
import AxonAgentSidebar from "./features/agent/AxonAgentSidebar";

function formatOutputTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeCssString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function colorWithAlpha(color: string, alpha: number) {
  const normalizedColor = color.trim();
  const match = normalizedColor.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i,
  );
  if (!match) return color;

  const [, red, green, blue, existingAlpha] = match;
  const baseAlpha = existingAlpha
    ? Number.parseInt(existingAlpha, 16) / 255
    : 1;
  const finalAlpha = Math.max(0, Math.min(1, alpha * baseAlpha));
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${finalAlpha})`;
}

declare global {
  interface Window {
    axonCompletionWorkspacePath?: string | null;
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      importFont: () => Promise<CustomFont | null>;
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
      onFileChanged: (
        callback: (data: { path: string; content: string }) => void,
      ) => () => void;
      onFolderChanged: (callback: () => void) => () => void;
      onGitChanged: (callback: () => void) => () => void;
      onTaskOutput: (callback: (event: TaskOutputEvent) => void) => () => void;
      onTaskFinished: (
        callback: (event: TaskFinishedEvent) => void,
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
        auth: () => Promise<import("../shared/spotify").SpotifyAuthResult>;
        disconnect: () => Promise<
          import("../shared/spotify").SpotifyActionResult
        >;
        getStatus: () => Promise<
          import("../shared/spotify").SpotifyStatusResult
        >;
        getPlaylists: () => Promise<
          import("../shared/spotify").SpotifyPlaylistsResult
        >;
        getPlaylistTracks: (
          playlistId: string,
          offset: number,
        ) => Promise<{
          ok: boolean;
          items: unknown[];
          total: number;
          next: string | null;
        }>;
        getPlaybackState: () => Promise<
          import("../shared/spotify").SpotifyPlaybackResult
        >;
        getDevices: () => Promise<
          import("../shared/spotify").SpotifyDevicesResult
        >;
        play: (
          request: import("../shared/spotify").SpotifyPlayTrackRequest,
        ) => Promise<import("../shared/spotify").SpotifyActionResult>;
        pause: () => Promise<import("../shared/spotify").SpotifyActionResult>;
        next: () => Promise<import("../shared/spotify").SpotifyActionResult>;
        previous: () => Promise<
          import("../shared/spotify").SpotifyActionResult
        >;
        seek: (
          positionMs: number,
        ) => Promise<import("../shared/spotify").SpotifyActionResult>;
        setVolume: (
          v: number,
        ) => Promise<import("../shared/spotify").SpotifyActionResult>;
        setShuffle: (
          state: boolean,
        ) => Promise<import("../shared/spotify").SpotifyActionResult>;
        setRepeat: (
          state: "off" | "track" | "context",
        ) => Promise<import("../shared/spotify").SpotifyActionResult>;
        onConnected: (callback: () => void) => () => void;
      };
    };
  }
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<Layout>(createInitialLayout);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [language, setLanguage] = useState("plaintext");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCreateNonce, setTerminalCreateNonce] = useState(0);
  const [terminalCreateWorkingDirectory, setTerminalCreateWorkingDirectory] =
    useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [taskRunnerOpen, setTaskRunnerOpen] = useState(false);
  const [fileOutlineOpen, setFileOutlineOpen] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] =
    useState<BottomPanelTab>("problems");
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState<string | null>(null);
  const [sourceControlOpen, setSourceControlOpen] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateInstallState, setUpdateInstallState] =
    useState<UpdateInstallState>({ phase: "idle" });
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsJsonPath, setSettingsJsonPath] = useState<string | null>(null);
  const [extensionState, setExtensionState] = useState<ExtensionState | null>(
    null,
  );
  const [monacoDiagnostics, setMonacoDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [lspDiagnosticsByFile, setLspDiagnosticsByFile] = useState<
    Record<string, EditorDiagnostic[]>
  >({});
  const [outputEntries, setOutputEntries] = useState<OutputEntry[]>([]);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(208);
  const [sidebarView, setSidebarView] = useState<
    "files" | "history" | "spotify"
  >("files");
  const [gitHistoryEditor, setGitHistoryEditor] = useState<{
    commit: GitHistoryCommit;
    file: GitHistoryFile;
    diff: GitCommitDiffResult;
  } | null>(null);
  const platform = window.axon.platform;
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const restoreStartedRef = useRef(false);
  const allowSessionPersistenceRef = useRef(true);
  const updateAutoDownloadVersionRef = useRef<string | null>(null);
  const autoStartedLspWorkspaceRef = useRef<string | null>(null);
  const activeLanguageServerStartRef = useRef<Set<string>>(new Set());
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [spotifyPlayerOpen, setSpotifyPlayerOpen] = useState(false);
  const [agentSidebarOpen, setAgentSidebarOpen] = useState(true);

  const sidebarSpotifyVisible = sidebarView === "spotify" && !sidebarCollapsed;
  const [spotifyState, spotifyActions] = useSpotify(sidebarSpotifyVisible);

  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);
  const extensionThemes = useMemo(
    () =>
      extensionState?.extensions.flatMap((extension) =>
        extension.enabled ? extension.themes : [],
      ) ?? [],
    [extensionState],
  );
  const themeTokens = useMemo(
    () => resolveThemeTokens(settings, extensionThemes),
    [extensionThemes, settings],
  );
  const themeCssVariables = useMemo(
    () => createThemeCssVariables(themeTokens),
    [themeTokens],
  );
  const appThemeCssVariables = useMemo(() => {
    if (!settings.editor.appTransparency) return themeCssVariables;

    const opacity = settings.editor.appBackgroundOpacity;

    // Electron's transparent BrowserWindow gives Axon a real transparent
    // native canvas, but the renderer still decides which surfaces participate
    // in that transparency. I only soften large background surfaces here so
    // text, icons, syntax tokens, and controls stay fully opaque and readable.
    return {
      ...themeCssVariables,
      "--axon-background": colorWithAlpha(themeTokens.background, opacity),
      "--axon-title-bar-background": colorWithAlpha(
        themeTokens["title_bar.background"],
        opacity,
      ),
      "--axon-toolbar-background": colorWithAlpha(
        themeTokens["toolbar.background"],
        opacity,
      ),
      "--axon-sidebar-background": colorWithAlpha(
        themeTokens["sidebar.background"],
        opacity,
      ),
      "--axon-panel-background": colorWithAlpha(
        themeTokens["panel.background"],
        opacity,
      ),
      "--axon-status-bar-background": colorWithAlpha(
        themeTokens["status_bar.background"],
        opacity,
      ),
      "--axon-editor-background": colorWithAlpha(
        themeTokens["editor.background"],
        opacity,
      ),
    } as typeof themeCssVariables;
  }, [
    settings.editor.appBackgroundOpacity,
    settings.editor.appTransparency,
    themeCssVariables,
    themeTokens,
  ]);

  const diagnostics = useMemo(() => {
    const mergedDiagnostics = [
      ...projectDiagnostics,
      ...monacoDiagnostics,
      ...Object.values(lspDiagnosticsByFile).flat(),
    ];
    const seenDiagnostics = new Set<string>();

    return mergedDiagnostics.filter((diagnostic) => {
      const key = [
        diagnostic.path,
        diagnostic.line,
        diagnostic.column,
        diagnostic.endLine ?? diagnostic.line,
        diagnostic.endColumn ?? diagnostic.column,
        diagnostic.severity,
        diagnostic.message,
      ].join("\u0000");

      if (seenDiagnostics.has(key)) return false;
      seenDiagnostics.add(key);
      return true;
    });
  }, [lspDiagnosticsByFile, monacoDiagnostics, projectDiagnostics]);

  const diagnosticCounts = useMemo(
    () =>
      diagnostics.reduce(
        (counts, diagnostic) => {
          counts.total += 1;
          counts[diagnostic.severity] += 1;
          return counts;
        },
        { total: 0, error: 0, warning: 0, info: 0, hint: 0 },
      ),
    [diagnostics],
  );

  useEffect(() => {
    // When the OAuth callback lands, the main process fires spotify:connected.
    // Re-check status so the panel transitions from auth gate to player.
    return window.axon.spotify.onConnected(() => {
      // SpotifyPanel re-checks status internally via useSpotify, so just
      // toggling visibility is enough, the hook's useEffect will re-run.
      setSpotifyOpen(true);
    });
  }, []);

  useEffect(() => {
    // Theme selection has to be applied at the app level, not only when an
    // editor widget mounts. Settings preview can change the active theme while
    // no editor has remounted, and Monaco keeps a global theme registry. This
    // effect keeps Monaco's active theme synchronized with Axon's resolved UI
    // tokens on every settings change.
    registerAxonTheme(
      monaco,
      settings.editor.themeId,
      themeTokens,
      extensionThemes,
    );
  }, [extensionThemes, settings.editor.themeId, themeTokens]);

  useEffect(() => {
    const styleId = "axon-monaco-default-token-fallback";
    const styleElement =
      document.getElementById(styleId) ??
      (() => {
        const nextStyleElement = document.createElement("style");
        nextStyleElement.id = styleId;
        document.head.appendChild(nextStyleElement);
        return nextStyleElement;
      })();

    // Monaco generates token CSS dynamically, and files with weak tokenization
    // such as Markdown body text, go.mod, go.sum, .sim, and plaintext can land
    // on its default token classes instead of one of Axon's rich syntax scopes.
    // I inject this after theme resolution with a concrete color so those
    // default spans cannot fall back to black on dark editor backgrounds.
    styleElement.textContent = `
      .monaco-editor .view-line,
      .monaco-editor .view-line span:not(.axon-go-function-token):not(.axon-go-method-token).mtk1,
      .monaco-editor .view-line span:not(.axon-go-function-token):not(.axon-go-method-token).mtk0,
      .monaco-editor .view-line span:not([class*="mtk"]) {
        color: ${themeTokens["editor.foreground"]} !important;
      }
    `;
  }, [themeTokens]);

  const activeFileSymbols = useMemo<FileSymbol[]>(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return [];
    const model = getModel(activeFile);
    if (!model || model.isDisposed()) return [];
    return collectFileSymbols(model.getValue());
  }, [activePane?.activeFile, layout]);
  const gitChangeCount = gitStatus?.changes.length ?? 0;
  const deletedFiles = useMemo(() => {
    return new Set(
      (gitStatus?.changes ?? [])
        .filter(
          (change) =>
            change.worktreeState === "deleted" ||
            change.indexState === "deleted",
        )
        .map((change) => change.absolutePath),
    );
  }, [gitStatus?.changes]);

  const appendOutput = useCallback(
    (source: string, message: string, level: OutputEntryLevel = "info") => {
      setOutputEntries((entries) =>
        [
          ...entries,
          {
            id: Date.now() + Math.random(),
            time: formatOutputTime(),
            level,
            source,
            message,
          },
        ].slice(-200),
      );
    },
    [],
  );

  const clearOutputEntries = useCallback(() => {
    // Clearing output should feel intentional, but the panel should not become
    // visually dead afterward. I leave a single timestamped marker so it is
    // obvious the user cleared the log and future task/AI output still has the
    // same chronological format as normal entries.
    setOutputEntries([
      {
        id: Date.now(),
        time: formatOutputTime(),
        level: "info",
        source: "output",
        message: "Output cleared.",
      },
    ]);
  }, []);

  useEffect(() => {
    if (!folderPath || !settings.lsp.enabled) {
      autoStartedLspWorkspaceRef.current = null;
      activeLanguageServerStartRef.current.clear();
      return;
    }

    if (autoStartedLspWorkspaceRef.current === folderPath) return;
    autoStartedLspWorkspaceRef.current = folderPath;

    // Completion should be ready by the time the user starts typing, not only
    // after they visit Settings. I auto-start relevant language servers once
    // per workspace while still respecting the LSP toggle, then leave manual
    // Start/Stop in Settings as the explicit override surface.
    window.axon
      .startLanguageServers(folderPath)
      .then((result) => {
        appendOutput("lsp", result.message, result.ok ? "success" : "error");
      })
      .catch((err) => {
        appendOutput(
          "lsp",
          err instanceof Error
            ? err.message
            : "Failed to start language servers.",
          "error",
        );
      });
  }, [appendOutput, folderPath, settings.lsp.enabled]);

  useEffect(() => {
    if (!folderPath || !settings.lsp.enabled || !activePane?.activeFile) return;

    const languageId = detectLanguage(activePane.activeFile);
    const startKey = `${folderPath}::${languageId}`;
    if (activeLanguageServerStartRef.current.has(startKey)) return;
    if (!window.axon.startLanguageServerForLanguage) return;
    activeLanguageServerStartRef.current.add(startKey);

    window.axon
      .startLanguageServerForLanguage({ folderPath, languageId })
      .then((result) => {
        if (result.message.startsWith("No external language server")) return;
        // I release the start key when the main process reports a failed
        // start because some managed servers can exit once during cold-start
        // workspace scanning and then succeed on the next attempt. Keeping the
        // failed key locked would make the renderer believe it already asked
        // for this workspace/language pair, leaving completions dead until the
        // user restarts Axon.
        if (!result.ok) {
          activeLanguageServerStartRef.current.delete(startKey);
        }
        appendOutput("lsp", result.message, result.ok ? "success" : "error");
      })
      .catch((err) => {
        // IPC errors are also transient from the renderer's point of view. If I
        // keep the key locked here, one failed bridge call permanently blocks
        // the next active-file change from starting the language server again.
        activeLanguageServerStartRef.current.delete(startKey);
        appendOutput(
          "lsp",
          err instanceof Error
            ? err.message
            : "Failed to start language server.",
          "error",
        );
      });
  }, [activePane?.activeFile, appendOutput, folderPath, settings.lsp.enabled]);

  const handleOpenUpdatePage = useCallback(() => {
    void window.axon.openUpdatePage(updateInfo?.releaseUrl);
  }, [updateInfo?.releaseUrl]);

  const handleDownloadUpdate = useCallback(async () => {
    const result = await window.axon.downloadUpdate();
    appendOutput("update", result.message, result.ok ? "success" : "error");
  }, [appendOutput]);

  const handleInstallUpdate = useCallback(async () => {
    const result = await window.axon.installUpdate();
    appendOutput("update", result.message, result.ok ? "success" : "error");
  }, [appendOutput]);

  const refreshGitStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!folderPath) {
        setGitStatus(null);
        return;
      }

      try {
        const nextStatus = await window.axon.getGitStatus(folderPath);
        setGitStatus(nextStatus);
        if (!options?.silent) {
          appendOutput(
            "git",
            nextStatus.isRepository
              ? `Git status found ${nextStatus.changes.length} changed file${nextStatus.changes.length === 1 ? "" : "s"}.`
              : "Workspace is not a Git repository.",
            nextStatus.isRepository ? "success" : "warning",
          );
        }
      } catch (err) {
        console.error("failed to refresh git status:", err);
        appendOutput("git", "Failed to refresh Git status.", "error");
        setGitStatus(null);
      }
    },
    [appendOutput, folderPath],
  );

  const refreshProjectDiagnostics = useCallback(async () => {
    if (!folderPath) {
      setProjectDiagnostics([]);
      appendOutput("diagnostics", "Skipped project diagnostics: no workspace.");
      return;
    }

    appendOutput("diagnostics", `Checking ${folderPath}`);
    try {
      const nextDiagnostics =
        await window.axon.getProjectDiagnostics(folderPath);
      setProjectDiagnostics(nextDiagnostics);
      appendOutput(
        "diagnostics",
        nextDiagnostics.length === 0
          ? "Project diagnostics completed with no errors."
          : `Project diagnostics found ${nextDiagnostics.length} issue${nextDiagnostics.length === 1 ? "" : "s"}.`,
        nextDiagnostics.length === 0 ? "success" : "warning",
      );
    } catch (err) {
      console.error("failed to load project diagnostics:", err);
      appendOutput("diagnostics", "Project diagnostics failed.", "error");
      setProjectDiagnostics([]);
    }
  }, [appendOutput, folderPath]);

  useEffect(() => {
    // The splash is a renderer overlay rather than a separate Electron window.
    // That keeps startup simple: the real app can mount and load settings
    // underneath while the brand animation plays once, then the overlay fades
    // out without creating another window lifecycle to coordinate.
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), 5000);
    const removeTimer = window.setTimeout(() => setSplashVisible(false), 5520);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    window.axon
      .getSettings(null)
      .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
      .catch((err) => {
        console.error("failed to load settings:", err);
      })
      .finally(() => {
        setSettingsHydrated(true);
      });
  }, []);

  const refreshExtensions = useCallback(async () => {
    try {
      const nextExtensionState = await window.axon.listExtensions(folderPath);
      setExtensionState(nextExtensionState);
    } catch (err) {
      console.error("failed to load extensions:", err);
      appendOutput("extensions", "Failed to load extensions.", "error");
    }
  }, [appendOutput, folderPath]);

  useEffect(() => {
    void refreshExtensions();
  }, [refreshExtensions]);

  useEffect(() => {
    // Axon uses two update data streams on purpose:
    //
    // - checkForUpdates reads the public GitHub release so the UI can show the
    //   newest version and render release notes as markdown.
    // - onUpdateState mirrors electron-updater's packaged-app lifecycle so the
    //   modal can move from Update -> progress -> Restart without guessing.
    //
    // Keeping those separate lets dev builds still preview release notes while
    // packaged builds get the real download/install path.
    window.axon
      .checkForUpdates()
      .then((nextUpdateInfo) => {
        setUpdateInfo(nextUpdateInfo);
        if (nextUpdateInfo.updateAvailable) {
          appendOutput(
            "update",
            `Axon ${nextUpdateInfo.latestVersion} is available.`,
            "success",
          );
        }
      })
      .catch((err) => {
        console.error("failed to check for updates:", err);
      });

    window.axon
      .getUpdateInstallState()
      .then(setUpdateInstallState)
      .catch((err) => {
        // Dev launches can briefly race ahead of the main-process handlers if
        // the renderer is talking to an older compiled main bundle. In that
        // case I keep the UI on the idle state instead of turning a stale
        // bootstrap mismatch into a noisy console error that does not help the
        // user.
        if (
          err instanceof Error &&
          err.message.includes("No handler registered")
        ) {
          setUpdateInstallState({ phase: "idle" });
          return;
        }
        console.error("failed to load updater state:", err);
      });

    return window.axon.onUpdateState(setUpdateInstallState);
  }, [appendOutput]);

  useEffect(() => {
    if (!updateInfo?.updateAvailable) return;
    if (
      updateInstallState.phase !== "idle" &&
      updateInstallState.phase !== "not-available"
    ) {
      return;
    }
    if (updateAutoDownloadVersionRef.current === updateInfo.latestVersion) {
      return;
    }

    updateAutoDownloadVersionRef.current = updateInfo.latestVersion;
    void handleDownloadUpdate();
  }, [
    handleDownloadUpdate,
    updateInfo?.latestVersion,
    updateInfo?.updateAvailable,
    updateInstallState.phase,
  ]);

  useEffect(() => {
    const styleId = "axon-custom-fonts";
    let styleElement = document.getElementById(
      styleId,
    ) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // Custom fonts are loaded from app-owned axon:// URLs returned by the main
    // process importer. Injecting one style tag from settings keeps the font
    // registry deterministic: changing settings JSON, saving settings, or
    // restarting Axon all rebuild the same @font-face list before UI/editor
    // components ask CSS or Monaco to use those font-family names.
    const customFontFaces = settings.customFonts
      .map((font) => {
        const family = escapeCssString(font.family);
        const url = escapeCssString(font.url);
        return `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
      })
      .join("\n");

    styleElement.textContent = [createBundledFontFaces(), customFontFaces]
      .filter(Boolean)
      .join("\n");
  }, [settings.customFonts]);

  useEffect(() => {
    return onEditorDiagnosticsChanged(setMonacoDiagnostics);
  }, []);

  useEffect(() => {
    setLspDiagnosticsByFile({});
    clearLanguageServerDiagnosticsFromMonaco();
    if (!folderPath || !settings.lsp.enabled) return;

    // LSP diagnostics arrive asynchronously from whichever server owns the
    // changed document. Keeping them keyed by file lets a server clear one
    // file's diagnostics without wiping problems from another language server.
    return window.axon.onLanguageServerDiagnostics((event) => {
      if (event.folderPath !== folderPath) return;
      setLspDiagnosticsByFile((current) => ({
        ...current,
        [event.filePath]: event.diagnostics,
      }));
    });
  }, [folderPath, settings.lsp.enabled]);

  useEffect(() => {
    syncLanguageServerDiagnosticsToMonaco(lspDiagnosticsByFile);
  }, [lspDiagnosticsByFile]);

  useEffect(() => {
    if (!folderPath || !settings.lsp.enabled) return;

    // Language servers fail for normal project reasons: a runtime can be
    // missing, Pyright can reject a virtualenv path, or a server can still be
    // warming up while Monaco asks for completion. Surfacing main-process LSP
    // logs in the Output panel keeps those failures visible without forcing the
    // user to open DevTools just to understand why autocomplete is quiet.
    return window.axon.onLanguageServerLog((event) => {
      if (event.folderPath !== folderPath) return;
      appendOutput("lsp", `[${event.serverId}] ${event.message}`, event.level);
    });
  }, [appendOutput, folderPath, settings.lsp.enabled]);

  useEffect(() => {
    const handleFileSaved = (event: Event) => {
      const saveEvent = event as CustomEvent<{ path?: string }>;
      const savedPath = saveEvent.detail?.path;
      if (!savedPath) return;

      const workspaceSettingsPath = folderPath
        ? `${folderPath}/axon.json`
        : null;
      if (
        savedPath !== workspaceSettingsPath &&
        savedPath !== settingsJsonPath
      ) {
        void refreshProjectDiagnostics();
        return;
      }

      // Manual settings edits should take effect as soon as the user saves the
      // file. We still route through the main-process settings reader so the
      // same validation and default-filling logic protects both app settings
      // and explicit project axon.json paths.
      window.axon
        .getSettings(folderPath)
        .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
        .catch((err) => {
          console.error("failed to reload settings json:", err);
        });
      void refreshProjectDiagnostics();
      void refreshGitStatus({ silent: true });
    };

    window.addEventListener("axon:fileSaved", handleFileSaved);
    return () => window.removeEventListener("axon:fileSaved", handleFileSaved);
  }, [
    folderPath,
    refreshGitStatus,
    refreshProjectDiagnostics,
    settingsJsonPath,
  ]);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged(() => {
      if (!folderPath) return;
      getTree(folderPath).then(setTree).catch(console.error);
      void refreshProjectDiagnostics();
      void refreshGitStatus({ silent: true });
    });
    return cleanup;
  }, [folderPath, refreshGitStatus, refreshProjectDiagnostics]);

  useEffect(() => {
    const cleanup = window.axon.onGitChanged(() => {
      void refreshGitStatus({ silent: true });
    });
    return cleanup;
  }, [refreshGitStatus]);

  useEffect(() => {
    const cleanupOutput = window.axon.onTaskOutput((event) => {
      appendOutput(
        event.label,
        event.line,
        event.stream === "stderr" ? "warning" : "info",
      );
    });
    const cleanupFinished = window.axon.onTaskFinished((event) => {
      appendOutput(
        event.label,
        event.exitCode === 0
          ? "Task completed successfully."
          : `Task exited with ${event.exitCode ?? event.signal ?? "unknown"}.`,
        event.exitCode === 0 ? "success" : "error",
      );
    });

    return () => {
      cleanupOutput();
      cleanupFinished();
    };
  }, [appendOutput]);

  const handleOpenFolder = async () => {
    try {
      const path = await window.axon.openFolder();
      if (!path) return;
      setLoading(true);
      appendOutput("workspace", `Opening ${path}`);
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await handleFolderChange(path, fileTree);
      appendOutput("workspace", `Opened ${path}`, "success");
    } catch (err) {
      console.error("failed to load tree:", err);
      const message =
        err instanceof Error
          ? `Failed to open folder: ${err.message}`
          : "Failed to open folder.";
      appendOutput("workspace", message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    window.axon
      .shouldRestoreSession()
      .then((shouldRestoreSession) => {
        if (!shouldRestoreSession) {
          allowSessionPersistenceRef.current = false;
          setSessionReady(true);
          return;
        }

        const session = loadWorkspaceSession();
        if (!session?.folderPath) {
          setSessionReady(true);
          return;
        }

        setLoading(true);
        getTree(session.folderPath)
          .then(async (fileTree) => {
            addRecentFolder(session.folderPath as string);
            await handleFolderChange(
              session.folderPath as string,
              fileTree,
              session,
            );
            appendOutput(
              "workspace",
              `Restored ${session.folderPath}`,
              "success",
            );
          })
          .catch((err) => {
            console.error("failed to restore workspace session:", err);
            appendOutput(
              "workspace",
              "Failed to restore previous workspace.",
              "error",
            );
          })
          .finally(() => {
            setLoading(false);
            setSessionReady(true);
          });
      })
      .catch((err) => {
        console.error("failed to read window restore mode:", err);
        setSessionReady(true);
      });
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!folderPath && !allowSessionPersistenceRef.current) return;

    // I persist only UI/navigation state here, never dirty editor contents.
    // Restoring unsaved buffers would require a separate crash-safe draft store;
    // until that exists, saving paths/tabs/panels gives useful continuity
    // without pretending unsaved edits are protected.
    saveWorkspaceSession({
      folderPath,
      layout,
      sidebarCollapsed,
      sidebarWidth,
      terminalOpen,
      bottomPanelOpen,
      bottomPanelTab,
    });
  }, [
    bottomPanelOpen,
    bottomPanelTab,
    folderPath,
    layout,
    sessionReady,
    sidebarCollapsed,
    sidebarWidth,
    terminalOpen,
  ]);

  const handleFolderChange = async (
    path: string,
    fileTree: FileNode,
    restoredSession?: WorkspaceSession | null,
  ) => {
    allowSessionPersistenceRef.current = true;
    setFolderPath(path);
    setTree(fileTree);
    setLayout(
      restoredSession?.layout
        ? sanitizeRestoredLayout(restoredSession.layout, fileTree)
        : createInitialLayout(),
    );

    // Opening another project should reset project-scoped UI. When this call is
    // fed by session restore, we apply the persisted chrome state; when it is a
    // fresh folder switch, the absent session naturally resets panels and panes.
    setTerminalOpen(restoredSession?.terminalOpen === true);
    setSidebarCollapsed(restoredSession?.sidebarCollapsed === true);
    setSidebarWidth(restoredSession?.sidebarWidth ?? 208);
    setBottomPanelOpen(restoredSession?.bottomPanelOpen === true);
    setBottomPanelTab(restoredSession?.bottomPanelTab ?? "problems");
    setTerminalCreateWorkingDirectory(null);
    appendOutput("workspace", `Loaded file tree for ${path}`);

    try {
      const workspaceSettings = await window.axon.getSettings(path);
      setSettings(normalizeSettings(workspaceSettings));
    } catch (err) {
      console.error("failed to load workspace settings:", err);
      appendOutput("settings", "Failed to load workspace settings.", "error");
    }

    await window.axon.unwatchFolder();
    await window.axon.watchFolder(path);
    appendOutput("workspace", "Watching workspace changes.");
    void window.axon
      .getGitStatus(path)
      .then(setGitStatus)
      .catch(() => {
        setGitStatus(null);
      });
    void window.axon
      .getProjectDiagnostics(path)
      .then((nextDiagnostics) => {
        setProjectDiagnostics(nextDiagnostics);
        appendOutput(
          "diagnostics",
          nextDiagnostics.length === 0
            ? "Project diagnostics completed with no errors."
            : `Project diagnostics found ${nextDiagnostics.length} issue${nextDiagnostics.length === 1 ? "" : "s"}.`,
          nextDiagnostics.length === 0 ? "success" : "warning",
        );
      })
      .catch((err) => {
        console.error("failed to load project diagnostics:", err);
        appendOutput("diagnostics", "Project diagnostics failed.", "error");
        setProjectDiagnostics([]);
      });
  };

  const handleRefresh = async () => {
    if (!folderPath) return;
    try {
      const fileTree = await getTree(folderPath);
      setTree(fileTree);
      await refreshGitStatus({ silent: true });
      appendOutput("workspace", "Refreshed file tree.");
    } catch (err) {
      console.error("failed to refresh tree:", err);
      appendOutput("workspace", "Failed to refresh file tree.", "error");
    }
  };

  // open a file in the active pane
  const handleFileSelect = (filePath: string) => {
    setLayout((prev) => openFileInPane(prev, prev.activePaneId, filePath));
  };

  const handleOpenHtmlPreview = (filePath: string) => {
    // HTML previews are represented as their own tab identity because a source
    // document and its rendered browser view are different editor surfaces.
    // Reusing the raw file path would make the preview fight with the Monaco
    // editor tab, while this wrapped path lets normal tab actions still move,
    // close, and persist the preview like every other pane tab.
    setLayout((prev) =>
      openFileInPane(
        prev,
        prev.activePaneId,
        createHtmlPreviewTabPath(filePath),
      ),
    );
  };

  const handleOpenNavigationTarget = useCallback(
    (target: Omit<EditorNavigationTarget, "id">) => {
      // Opening a search result needs two separate pieces of state: the layout
      // must activate the file tab, and the mounted editor must reveal a
      // position after its Monaco model is attached. The nonce keeps repeated
      // jumps to the same line working because React sees a fresh target.
      const nextTarget = {
        ...target,
        id: Date.now(),
      };
      setNavigationTarget(nextTarget);
      setLayout((prev) => {
        const existingPane = prev.panes.find((pane) =>
          pane.openTabs.includes(target.path),
        );

        // Search should feel like a navigation command, not a duplicate file
        // opener. If the match already lives in another pane, Axon should
        // focus that pane and reveal the line in place instead of opening a
        // second copy in the active pane and making the same file feel split
        // across two surfaces for no reason.
        if (existingPane) {
          return openFileInPane(prev, existingPane.id, target.path);
        }

        return openFileInPane(prev, prev.activePaneId, target.path);
      });
    },
    [],
  );

  useEffect(() => {
    const handleNavigateToFile = (event: Event) => {
      const navigationEvent = event as CustomEvent<
        Omit<EditorNavigationTarget, "id">
      >;
      if (!navigationEvent.detail?.path) return;
      handleOpenNavigationTarget(navigationEvent.detail);
    };

    window.addEventListener("axon:navigateToFile", handleNavigateToFile);
    return () =>
      window.removeEventListener("axon:navigateToFile", handleNavigateToFile);
  }, [handleOpenNavigationTarget]);

  const handleWorkspaceSearchResult = (
    result: WorkspaceSearchResult,
    query: string,
  ) => {
    handleOpenNavigationTarget({
      path: result.path,
      line: result.line,
      column: result.column,
      length: Math.max(1, query.trim().length),
    });
  };

  // split the active pane in the given direction
  const handleSplit = (direction: SplitDirection, filePath?: string) => {
    setLayout((prev) =>
      splitPane(prev, prev.activePaneId, direction, filePath),
    );
  };

  const handleNewFile = async () => {
    if (!folderPath) return;
    const name = `untitled-${Date.now()}.ts`;
    const path = `${folderPath}/${name}`;
    await createFile(path);
    await handleRefresh();
    handleFileSelect(path);
    appendOutput("file", `Created ${name}`, "success");
  };

  const handleSettingsSave = async (nextSettings: AxonSettings) => {
    const normalizedSettings = normalizeSettings(nextSettings);
    setSettings(normalizedSettings);

    try {
      const savedSettings = await window.axon.updateSettings(
        normalizedSettings,
        null,
      );
      setSettings(normalizeSettings(savedSettings));
      appendOutput("settings", "Saved settings.", "success");
    } catch (err) {
      console.error("failed to save settings:", err);
      appendOutput("settings", "Failed to save settings.", "error");
    }
  };

  const handleSettingsPreview = useCallback((nextSettings: AxonSettings) => {
    // SettingsModal owns the editable draft, but App owns the live theme and
    // editor options. Previewing through this callback keeps the shell, Monaco,
    // terminal, and panels in sync with the current draft without writing every
    // slider movement or color keystroke to the app settings file.
    setSettings(normalizeSettings(nextSettings));
  }, []);

  const handleOpenSettingsJson = async () => {
    try {
      const settingsPath = await window.axon.ensureSettingsFile(null, settings);
      setSettingsJsonPath(settingsPath);
      handleFileSelect(settingsPath);
      appendOutput("settings", `Opened ${settingsPath}`);
    } catch (err) {
      console.error("failed to open settings json:", err);
      appendOutput("settings", "Failed to open settings JSON.", "error");
    }
  };

  const handleOpenDiagnostic = (diagnostic: EditorDiagnostic) => {
    handleOpenNavigationTarget({
      path: diagnostic.path,
      line: diagnostic.line,
      column: diagnostic.column,
      length: Math.max(
        1,
        (diagnostic.endColumn ?? diagnostic.column + 1) - diagnostic.column,
      ),
    });
  };

  const navigateDiagnostic = useCallback(
    (direction: 1 | -1) => {
      if (diagnostics.length === 0) {
        setBottomPanelTab("problems");
        setBottomPanelOpen(true);
        setTerminalOpen(false);
        return;
      }

      const orderedDiagnostics = [...diagnostics].sort((a, b) => {
        if (a.path !== b.path) return a.path.localeCompare(b.path);
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });

      const activeFile = activePane?.activeFile;
      const anchor = activeFile
        ? {
            path: activeFile,
            line: cursorInfo.line,
            column: cursorInfo.col,
          }
        : null;

      const compareWithAnchor = (diagnostic: EditorDiagnostic) => {
        if (!anchor) return direction;
        if (diagnostic.path !== anchor.path) {
          return diagnostic.path.localeCompare(anchor.path);
        }
        if (diagnostic.line !== anchor.line) {
          return diagnostic.line - anchor.line;
        }
        return diagnostic.column - anchor.column;
      };

      const nextDiagnostic =
        direction === 1
          ? orderedDiagnostics.find(
              (diagnostic) => compareWithAnchor(diagnostic) > 0,
            ) ?? orderedDiagnostics[0]
          : [...orderedDiagnostics]
              .reverse()
              .find((diagnostic) => compareWithAnchor(diagnostic) < 0) ??
            orderedDiagnostics[orderedDiagnostics.length - 1];

      // Problem navigation is intentionally based on the merged diagnostics
      // store instead of the currently mounted Monaco model. That lets F8 walk
      // into unopened files from LSP/project diagnostics, which is the behavior
      // users expect from a real Problems workflow rather than a per-tab marker
      // shortcut.
      handleOpenDiagnostic(nextDiagnostic);
      setBottomPanelTab("problems");
    },
    [activePane?.activeFile, cursorInfo.col, cursorInfo.line, diagnostics],
  );

  const handleNewTerminal = () => {
    setTerminalCreateWorkingDirectory(null);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
    appendOutput("terminal", "Created terminal tab.");
  };

  const handleOpenTabInTerminal = (filePath: string) => {
    const separatorIndex = Math.max(
      filePath.lastIndexOf("/"),
      filePath.lastIndexOf("\\"),
    );
    const parentPath =
      separatorIndex > 0 ? filePath.slice(0, separatorIndex) : folderPath;

    setTerminalCreateWorkingDirectory(parentPath);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
    appendOutput(
      "terminal",
      `Opening terminal at ${parentPath ?? "workspace"}.`,
    );
  };

  const handleOpenPathInTerminal = (path: string) => {
    setTerminalCreateWorkingDirectory(path);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
    appendOutput("terminal", `Opening terminal at ${path}.`);
  };

  const handleRunWorkspaceTask = async (task: WorkspaceTask) => {
    if (!folderPath) return;

    // Task output belongs in the Output panel, not in the terminal tabs. The
    // task runner is non-interactive and project-scoped, so opening Output here
    // gives a predictable place for build/test logs while preserving terminal
    // sessions for interactive shell work.
    setTerminalOpen(false);
    setBottomPanelTab("output");
    setBottomPanelOpen(true);
    appendOutput("task", `Starting ${task.label}.`);

    try {
      await window.axon.runWorkspaceTask(folderPath, task.id);
    } catch (err) {
      console.error("failed to start task:", err);
      appendOutput("task", `Failed to start ${task.label}.`, "error");
    }
  };

  const saveFileFromModel = useCallback(
    async (filePath: string) => {
      const model = getModel(filePath);
      if (!model || model.isDisposed()) return false;

      await writeFile(filePath, model.getValue());
      if (folderPath) {
        const languageId = detectLanguage(filePath);
        if (languageId !== "plaintext") {
          try {
            await window.axon.syncLanguageServerDocument({
              folderPath,
              filePath,
              languageId,
              content: model.getValue(),
            });
          } catch (err) {
            // Saving the file must never fail just because the language server
            // is unavailable. I still try to push the latest saved content into
            // LSP immediately so diagnostics refresh from the same text that
            // hit disk, then fall back to the normal server reconnect/output
            // path if the sync bridge is not ready yet.
            console.error("failed to sync saved file with language server:", err);
          }
        }
      }
      setLayout((prev) => ({
        ...prev,
        panes: prev.panes.map((pane) => ({
          ...pane,
          dirtyFiles: {
            ...pane.dirtyFiles,
            [filePath]: false,
          },
        })),
      }));
      window.dispatchEvent(
        new CustomEvent("axon:fileSaved", { detail: { path: filePath } }),
      );
      appendOutput("file", `Saved ${filePath}`, "success");
      void refreshProjectDiagnostics();
      return true;
    },
    [appendOutput, folderPath, refreshProjectDiagnostics],
  );

  const handleSaveActiveFile = useCallback(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;

    // Save has to work from the native menu, the global keyboard listener, and
    // Monaco itself. Dispatching an event to a mounted SingleEditor is fragile
    // because the active file can be in a pane whose listener is not the
    // current focus target. The shared Monaco model is the source of truth for
    // dirty buffers, so writing it directly here makes Cmd/Ctrl+S behave like
    // a real editor command no matter where focus currently is.
    void saveFileFromModel(activeFile).then((saved) => {
      if (!saved) {
        appendOutput("file", "Could not find editor buffer to save.", "error");
      }
    });
  }, [activePane?.activeFile, appendOutput, saveFileFromModel]);

  const requestCloseTab = useCallback(
    async (paneId: string, filePath: string) => {
      const pane = layout.panes.find((candidate) => candidate.id === paneId);
      const isDirty = pane?.dirtyFiles[filePath] === true;

      if (isDirty) {
        // This is intentionally a close-time guard instead of a tab-button-only
        // guard. Tabs can close from the keyboard, command palette, context menu,
        // or pane logic, so every path has to pass through the same decision.
        const shouldSave = window.confirm(
          `Save changes to ${filePath.split(/[\\/]/).pop() ?? filePath} before closing?\n\nOK saves. Cancel closes without saving.`,
        );

        if (shouldSave) {
          try {
            const saved = await saveFileFromModel(filePath);
            if (!saved) {
              appendOutput(
                "file",
                "Could not find editor buffer to save.",
                "error",
              );
              return;
            }
          } catch (err) {
            console.error("failed to save before close:", err);
            appendOutput("file", "Failed to save before closing.", "error");
            return;
          }
        }
      }

      setLayout((prev) => closeTabInPane(prev, paneId, filePath));
    },
    [appendOutput, layout.panes, saveFileFromModel],
  );

  const handleCloseActiveTab = () => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;
    void requestCloseTab(layout.activePaneId, activeFile);
  };

  const handleUpdateSettings = useCallback(async (next: AxonSettings) => {
    const normalized = await window.axon.updateSettings(next, null);
    setSettings(normalized);
  }, []);

  const runEditorAction = useCallback(
    (action: "definition" | "references" | "rename" | "format") => {
      const activeFile = activePane?.activeFile;
      if (!activeFile) return;

      // App owns global commands, but SingleEditor owns Monaco. Keeping this
      // as a small typed browser event lets the command palette, shortcuts,
      // and future menu items trigger editor-native behavior without leaking
      // Monaco action ids into the app shell. When real LSP providers are
      // registered later, this bridge can stay the same while Monaco receives
      // richer definitions and references behind the scenes.
      window.dispatchEvent(
        new CustomEvent("axon:editorAction", {
          detail: { path: activeFile, action },
        }),
      );
    },
    [activePane?.activeFile],
  );

  const runCommand = useCallback(
    (command: AxonCommand) => {
      if (command.startsWith("extension:")) {
        const commandId = command.slice("extension:".length);
        appendOutput(
          "extensions",
          `Extension command '${commandId}' is registered. Executable extension hosts are intentionally disabled until the sandbox API is expanded.`,
          "warning",
        );
        return;
      }

      switch (command) {
        case AXON_COMMANDS.ABOUT:
          setAboutOpen(true);
          break;
        case AXON_COMMANDS.NEW_FILE:
          void handleNewFile();
          break;
        case AXON_COMMANDS.OPEN_FOLDER:
          void handleOpenFolder();
          break;
        case AXON_COMMANDS.SAVE:
          handleSaveActiveFile();
          break;
        case AXON_COMMANDS.CLOSE_TAB:
          handleCloseActiveTab();
          break;
        case AXON_COMMANDS.OPEN_COMMAND_PALETTE:
          setPaletteOpen((prev) => !prev);
          break;
        case AXON_COMMANDS.OPEN_WORKSPACE_SEARCH:
          setWorkspaceSearchOpen((prev) => !prev);
          break;
        case AXON_COMMANDS.OPEN_TASK_RUNNER:
          setTaskRunnerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_FILE_OUTLINE:
          setFileOutlineOpen(true);
          break;
        case AXON_COMMANDS.GO_TO_DEFINITION:
          runEditorAction("definition");
          break;
        case AXON_COMMANDS.FIND_REFERENCES:
          runEditorAction("references");
          break;
        case AXON_COMMANDS.RENAME_SYMBOL:
          runEditorAction("rename");
          break;
        case AXON_COMMANDS.FORMAT_DOCUMENT:
          runEditorAction("format");
          break;
        case AXON_COMMANDS.OPEN_HTML_PREVIEW:
          if (activePane?.activeFile && isHtmlFile(activePane.activeFile)) {
            handleOpenHtmlPreview(activePane.activeFile);
          }
          break;
        case AXON_COMMANDS.OPEN_PROBLEMS_PANEL:
          setBottomPanelTab("problems");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          appendOutput("panel", "Opened Problems panel.");
          break;
        case AXON_COMMANDS.OPEN_OUTPUT_PANEL:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          appendOutput("panel", "Opened Output panel.");
          break;
        case AXON_COMMANDS.REFRESH_DIAGNOSTICS:
          setBottomPanelTab("problems");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          void refreshProjectDiagnostics();
          break;
        case AXON_COMMANDS.NEXT_PROBLEM:
          navigateDiagnostic(1);
          break;
        case AXON_COMMANDS.PREVIOUS_PROBLEM:
          navigateDiagnostic(-1);
          break;
        case AXON_COMMANDS.CLEAR_OUTPUT:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          clearOutputEntries();
          break;
        case AXON_COMMANDS.OPEN_DIFF_VIEW:
          if (activePane?.activeFile) {
            setDiffFilePath(activePane.activeFile);
            setDiffOpen(true);
          }
          break;
        case AXON_COMMANDS.OPEN_SOURCE_CONTROL:
          setSourceControlOpen(true);
          void refreshGitStatus();
          break;
        case AXON_COMMANDS.OPEN_GIT_HISTORY:
          setSidebarCollapsed(false);
          setSidebarView("history");
          void refreshGitStatus({ silent: true });
          break;
        case AXON_COMMANDS.TOGGLE_TERMINAL:
          setBottomPanelOpen(false);
          setTerminalOpen((prev) => !prev);
          appendOutput(
            "terminal",
            terminalOpen ? "Hid terminal." : "Showed terminal.",
          );
          break;
        case AXON_COMMANDS.OPEN_SETTINGS:
          setSettingsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_EXTENSIONS:
          setExtensionsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_SETTINGS_JSON:
          void handleOpenSettingsJson();
          break;
        case AXON_COMMANDS.OPEN_UPDATE_NOTES:
          if (updateInfo?.updateAvailable) {
            setUpdateModalOpen(true);
          }
          break;
        case AXON_COMMANDS.TOGGLE_ZEN_MODE:
          setZenMode((prev) => !prev);
          break;
        case AXON_COMMANDS.NEW_TERMINAL:
          handleNewTerminal();
          break;
      }
    },
    [
      activePane?.activeFile,
      appendOutput,
      clearOutputEntries,
      folderPath,
      handleSaveActiveFile,
      layout.activePaneId,
      navigateDiagnostic,
      refreshProjectDiagnostics,
      refreshGitStatus,
      requestCloseTab,
      runEditorAction,
      settings,
      terminalOpen,
      updateInfo?.updateAvailable,
    ],
  );

  const paletteCommands = useMemo<CommandPaletteCommand[]>(() => {
    const extensionCommands =
      extensionState?.extensions.flatMap((extension) =>
        extension.enabled
          ? extension.contributes.commands.map((command) => ({
              id: `extension:${extension.id}.${command.id}` as const,
              title: command.title,
              group: command.category ?? "Extensions",
              subtitle:
                command.description ?? `${extension.name} command contribution`,
              keywords: [extension.name, extension.publisher, command.id],
            }))
          : [],
      ) ?? [];

    return [
      {
        id: AXON_COMMANDS.NEW_FILE,
        title: "New File",
        group: "File",
        shortcut: "Cmd N",
        subtitle: folderPath
          ? "Create a file in the current workspace"
          : "Open a folder first",
        keywords: ["create", "untitled"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_FOLDER,
        title: "Open Folder",
        group: "File",
        shortcut: "Cmd O",
        subtitle: "Choose another workspace folder",
        keywords: ["workspace", "project"],
      },
      {
        id: AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
        title: "Search Workspace",
        group: "Search",
        shortcut: "Cmd Shift F",
        subtitle: folderPath
          ? "Search text across the current folder"
          : "Open a folder first",
        keywords: ["find", "grep"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_TASK_RUNNER,
        title: "Run Task",
        group: "Workspace",
        subtitle: folderPath
          ? "Run package, Go, or Cargo workspace tasks"
          : "Open a folder first",
        keywords: ["build", "test", "npm", "go", "cargo"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_FILE_OUTLINE,
        title: "File Outline",
        group: "Navigation",
        shortcut: "Cmd Shift O",
        subtitle: activePane?.activeFile
          ? `${activeFileSymbols.length} symbols in active file`
          : "Select a file first",
        keywords: ["symbols", "outline", "functions", "classes"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.GO_TO_DEFINITION,
        title: "Go to Definition",
        group: "Navigation",
        shortcut: "F12",
        subtitle: activePane?.activeFile
          ? "Jump to the symbol definition Monaco can resolve"
          : "Select a file first",
        keywords: ["definition", "symbol", "jump"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.FIND_REFERENCES,
        title: "Find References",
        group: "Navigation",
        shortcut: "Shift F12",
        subtitle: activePane?.activeFile
          ? "Show usages for the current symbol"
          : "Select a file first",
        keywords: ["references", "usages", "symbol"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.RENAME_SYMBOL,
        title: "Rename Symbol",
        group: "Navigation",
        subtitle: activePane?.activeFile
          ? "Rename the current symbol through the active language server"
          : "Select a file first",
        keywords: ["rename", "symbol", "refactor"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.FORMAT_DOCUMENT,
        title: "Format Document",
        group: "Editor",
        subtitle: activePane?.activeFile
          ? "Format the active file through the active language server"
          : "Select a file first",
        keywords: ["format", "pretty", "indent"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_HTML_PREVIEW,
        title: "Open HTML Preview",
        group: "Preview",
        subtitle:
          activePane?.activeFile && isHtmlFile(activePane.activeFile)
            ? "Open the active HTML file in Axon's preview tab"
            : "Select an HTML file first",
        keywords: ["browser", "live", "preview", "web"],
        disabled: !activePane?.activeFile || !isHtmlFile(activePane.activeFile),
      },
      {
        id: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
        title: "Show Problems",
        group: "Panel",
        subtitle: `${diagnostics.length} diagnostics`,
        keywords: ["diagnostics", "errors", "warnings"],
      },
      {
        id: AXON_COMMANDS.REFRESH_DIAGNOSTICS,
        title: "Refresh Diagnostics",
        group: "Diagnostics",
        subtitle: folderPath
          ? "Run project diagnostics for the current workspace"
          : "Open a folder first",
        keywords: ["diagnostics", "check", "errors", "lint"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.NEXT_PROBLEM,
        title: "Go to Next Problem",
        group: "Diagnostics",
        shortcut: "F8",
        subtitle:
          diagnostics.length > 0
            ? "Jump to the next diagnostic in the workspace"
            : "No problems in this workspace",
        keywords: ["diagnostics", "errors", "warnings", "next"],
        disabled: diagnostics.length === 0,
      },
      {
        id: AXON_COMMANDS.PREVIOUS_PROBLEM,
        title: "Go to Previous Problem",
        group: "Diagnostics",
        shortcut: "Shift F8",
        subtitle:
          diagnostics.length > 0
            ? "Jump to the previous diagnostic in the workspace"
            : "No problems in this workspace",
        keywords: ["diagnostics", "errors", "warnings", "previous"],
        disabled: diagnostics.length === 0,
      },
      {
        id: AXON_COMMANDS.OPEN_OUTPUT_PANEL,
        title: "Show Output",
        group: "Panel",
        subtitle: "Open logs, task output, and future AI output",
        keywords: ["logs", "panel"],
      },
      {
        id: AXON_COMMANDS.CLEAR_OUTPUT,
        title: "Clear Output",
        group: "Panel",
        subtitle: "Clear the Output panel log",
        keywords: ["logs", "output", "reset"],
      },
      {
        id: AXON_COMMANDS.TOGGLE_TERMINAL,
        title: terminalOpen ? "Hide Terminal" : "Show Terminal",
        group: "Terminal",
        shortcut: "Cmd J",
        subtitle: "Toggle the terminal panel",
        keywords: ["shell", "console"],
      },
      {
        id: AXON_COMMANDS.NEW_TERMINAL,
        title: "New Terminal",
        group: "Terminal",
        subtitle: "Create a terminal tab",
        keywords: ["shell", "pty"],
      },
      {
        id: AXON_COMMANDS.OPEN_DIFF_VIEW,
        title: "Compare Active File",
        group: "Git",
        shortcut: "Cmd Shift D",
        subtitle: activePane?.activeFile
          ? "Open the active file diff view"
          : "Select a file first",
        keywords: ["diff", "changes"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_SOURCE_CONTROL,
        title: "Source Control",
        group: "Git",
        shortcut: "Cmd Shift G",
        subtitle: folderPath
          ? `${gitChangeCount} changed file${gitChangeCount === 1 ? "" : "s"}`
          : "Open a folder first",
        keywords: ["git", "changes", "diff", "source"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_GIT_HISTORY,
        title: "Git History",
        group: "Git",
        subtitle: folderPath
          ? "Show commit history in the sidebar"
          : "Open a folder first",
        keywords: ["git", "history", "commit", "log"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.SAVE,
        title: "Save Active File",
        group: "File",
        shortcut: "Cmd S",
        subtitle: activePane?.activeFile
          ? "Save the current tab"
          : "No active file",
        keywords: ["write"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.CLOSE_TAB,
        title: "Close Active Tab",
        group: "File",
        shortcut: "Cmd W",
        subtitle: activePane?.activeFile
          ? "Close the current tab"
          : "No active file",
        keywords: ["remove"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS,
        title: "Open Settings",
        group: "Settings",
        shortcut: "Cmd ,",
        subtitle: "Edit settings from the UI",
        keywords: ["preferences", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.OPEN_EXTENSIONS,
        title: "Open Extensions",
        group: "Extensions",
        subtitle: "Manage local extension packages and contributed themes",
        keywords: ["plugins", "themes", "syntax", "packages"],
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS_JSON,
        title: "Open Settings JSON",
        group: "Settings",
        shortcut: "Cmd Shift ,",
        subtitle: "Edit settings JSON directly",
        keywords: ["preferences", "config", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.OPEN_UPDATE_NOTES,
        title: updateInfo?.updateAvailable
          ? `View Axon ${updateInfo.latestVersion} Update`
          : "View Update Notes",
        group: "Update",
        subtitle: updateInfo?.updateAvailable
          ? "Open release notes and update actions"
          : "No update is available",
        keywords: ["release", "version", "download"],
        disabled: !updateInfo?.updateAvailable,
      },
      {
        id: AXON_COMMANDS.TOGGLE_ZEN_MODE,
        title: zenMode ? "Exit Zen Mode" : "Enter Zen Mode",
        group: "View",
        shortcut: "Cmd Shift Z",
        subtitle: "Toggle focused editor layout",
        keywords: ["focus", "fullscreen"],
      },
      {
        id: AXON_COMMANDS.ABOUT,
        title: "About Axon",
        group: "Help",
        subtitle: "Show app and runtime information",
        keywords: ["version"],
      },
      ...extensionCommands,
    ];
  }, [
    activePane?.activeFile,
    activeFileSymbols.length,
    diagnostics.length,
    extensionState,
    folderPath,
    gitChangeCount,
    terminalOpen,
    updateInfo?.latestVersion,
    updateInfo?.updateAvailable,
    zenMode,
  ]);

  useEffect(() => {
    window.axonCompletionWorkspacePath = folderPath;
  }, [folderPath]);

  useEffect(() => {
    const cleanup = window.axon.onMenuCommand(runCommand);

    return cleanup;
  }, [runCommand]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F12" && !e.shiftKey) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.GO_TO_DEFINITION);
      }
      if (e.key === "F12" && e.shiftKey) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.FIND_REFERENCES);
      }
      if (e.key === "F8" && !e.shiftKey) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.NEXT_PROBLEM);
      }
      if (e.key === "F8" && e.shiftKey) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.PREVIOUS_PROBLEM);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.SAVE);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        runCommand(AXON_COMMANDS.TOGGLE_TERMINAL);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "o"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_FILE_OUTLINE);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "g"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SETTINGS);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "," || e.key === "<")
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SETTINGS_JSON);
      }
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runCommand, zenMode]);

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden relative"
      style={{
        ...appThemeCssVariables,
        background: "var(--axon-background)",
        backdropFilter:
          settings.editor.appTransparency &&
          settings.editor.appBackgroundBlur > 0
            ? `blur(${settings.editor.appBackgroundBlur}px)`
            : undefined,
        fontFamily: fontStack(
          settings.editor.uiFontFamily,
          "system-ui, sans-serif",
        ),
        fontWeight: settings.editor.fontWeight,
        letterSpacing: 0,
      }}
    >
      {zenMode && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-9 z-40"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          />
          <div
            className="absolute top-11 right-3 z-50"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              onClick={() => setZenMode(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] text-[#586478] hover:text-white hover:border-[#80c8e0] transition-colors cursor-pointer"
              style={{
                background: "var(--axon-panel-background)",
                borderColor: "var(--axon-panel-border)",
              }}
            >
              exit zen
            </button>
          </div>
        </>
      )}

      <div className={`flex flex-1 overflow-hidden ${zenMode ? "pt-9" : ""}`}>
        {!zenMode && (
          <Sidebar
            tree={tree}
            folderPath={folderPath}
            activeFile={activePane?.activeFile ?? null}
            onFileSelect={handleFileSelect}
            onOpenFolder={handleOpenFolder}
            onFolderChange={handleFolderChange}
            onRefresh={handleRefresh}
            loading={loading}
            collapsed={sidebarCollapsed}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            view={sidebarView}
            onOpenGitHistoryFile={(commit, file, diff) => {
              setGitHistoryEditor({ commit, file, diff });
            }}
            onSplitFile={(filePath) => handleSplit("right", filePath)}
            onOpenInTerminal={handleOpenPathInTerminal}
            onOpenHtmlPreview={handleOpenHtmlPreview}
            onEntryDeleted={(path) =>
              setLayout((prev) => removePathFromLayout(prev, path))
            }
            onEntryMoved={(oldPath, newPath) =>
              setLayout((prev) => replacePathInLayout(prev, oldPath, newPath))
            }
            onEntryRenamed={(oldPath, newPath) =>
              setLayout((prev) => replacePathInLayout(prev, oldPath, newPath))
            }
            gitChanges={gitStatus?.changes ?? []}
            ignoredPaths={gitStatus?.ignoredPaths ?? []}
            folderPickerOpen={folderPickerOpen}
            onOpenFolderPicker={() => setFolderPickerOpen(true)}
            onCloseFolderPicker={() => setFolderPickerOpen(false)}
            platform={platform}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            spotifyState={spotifyState}
            spotifyActions={spotifyActions}
            playerOpen={spotifyPlayerOpen}
            onTogglePlayer={() => setSpotifyPlayerOpen((p) => !p)}
          />
        )}

        {spotifyPlayerOpen && spotifyState.status?.connected && (
          <SpotifyFloatingPlayer
            playback={spotifyState.playback}
            onPlay={spotifyActions.play}
            onPause={spotifyActions.pause}
            onNext={spotifyActions.next}
            onPrevious={spotifyActions.previous}
            onSeek={spotifyActions.seek}
            onSetVolume={spotifyActions.setVolume}
            onSetShuffle={spotifyActions.setShuffle}
            onSetRepeat={spotifyActions.setRepeat}
            devices={spotifyState.devices}
            selectedDeviceId={spotifyState.selectedDeviceId}
            loadingDevices={spotifyState.loadingDevices}
            onSelectDevice={spotifyActions.selectDevice}
            onRefreshDevices={spotifyActions.refreshDevices}
            onClose={() => setSpotifyPlayerOpen(false)}
          />
        )}

        <div className="relative flex flex-col flex-1 overflow-hidden">
          {!zenMode && (
            <div
              className="flex items-center border-b pr-1"
              style={{
                background: "var(--axon-toolbar-background)",
                borderColor: "var(--axon-panel-border)",
                WebkitAppRegion: "drag",
              }}
            >
              <div className="flex min-w-0 flex-1 overflow-hidden" />
              <div
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <EditorToolbar
                  onNewFile={() => runCommand(AXON_COMMANDS.NEW_FILE)}
                  onOpenFile={() =>
                    runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE)
                  }
                  onDiff={() => runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW)}
                  onNewTerminal={() => runCommand(AXON_COMMANDS.NEW_TERMINAL)}
                  onSplit={handleSplit}
                  onZenMode={() => runCommand(AXON_COMMANDS.TOGGLE_ZEN_MODE)}
                  onSettings={() => runCommand(AXON_COMMANDS.OPEN_SETTINGS)}
                  onExtensions={() => setExtensionsOpen(true)}
                  onAbout={() => setAboutOpen(true)}
                  updateInfo={updateInfo}
                  updateInstallState={updateInstallState}
                  onOpenUpdate={() => setUpdateModalOpen(true)}
                  isZenMode={zenMode}
                  hasWorkspace={!!folderPath}
                  hasActiveFile={!!activePane?.activeFile}
                />
              </div>
              {platform === "win32" ? (
                <div className="w-[138px] shrink-0" aria-hidden="true" />
              ) : null}
            </div>
          )}

          {gitHistoryEditor ? (
            <GitHistoryEditor
              commit={gitHistoryEditor.commit}
              file={gitHistoryEditor.file}
              diff={gitHistoryEditor.diff}
              editorSettings={settings.editor}
              themeTokens={themeTokens}
              onClose={() => setGitHistoryEditor(null)}
            />
          ) : settingsHydrated ? (
            <EditorPane
              layout={layout}
              folderPath={folderPath}
              onActivatePane={(id) =>
                setLayout((prev) => ({ ...prev, activePaneId: id }))
              }
              onSelectFile={(paneId, f) =>
                setLayout((prev) => openFileInPane(prev, paneId, f))
              }
              onCloseTab={(paneId, f) => void requestCloseTab(paneId, f)}
              onPinTab={(paneId, f, pinned) =>
                setLayout((prev) => setPinnedInPane(prev, paneId, f, pinned))
              }
              onReorderTabs={(paneId, tabs) =>
                setLayout((prev) => reorderTabsInPane(prev, paneId, tabs))
              }
              onDirtyChange={(paneId, f, d) =>
                setLayout((prev) => setDirtyInPane(prev, paneId, f, d))
              }
              onCursorChange={(line, col) => setCursorInfo({ line, col })}
              onLanguageChange={setLanguage}
              onMoveTabBetweenPanes={(f, src, tgt) =>
                setLayout((prev) => moveTabBetweenPanes(prev, src, tgt, f))
              }
              onClosePane={(paneId) =>
                setLayout((prev) => closePane(prev, paneId))
              }
              onOpenTabInTerminal={handleOpenTabInTerminal}
              onOpenFile={handleFileSelect}
              onOpenNavigationTarget={handleOpenNavigationTarget}
              editorSettings={settings.editor}
              themeTokens={themeTokens}
              navigationTarget={navigationTarget}
              gitChanges={gitStatus?.changes ?? []}
              deletedFiles={deletedFiles}
              handleOpenFolder={handleOpenFolder}
              handleNewFile={handleNewFile}
              handleFolderChange={handleFolderChange}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[var(--axon-editor-background)] text-[12px] text-[#586478]">
              loading editor...
            </div>
          )}

          <Terminal
            open={terminalOpen && !zenMode}
            createNonce={terminalCreateNonce}
            createWorkingDirectory={terminalCreateWorkingDirectory}
            editorSettings={settings.editor}
            themeTokens={themeTokens}
            workingDirectory={folderPath}
            activePanelTab={
              !zenMode && bottomPanelOpen ? bottomPanelTab : "terminal"
            }
            diagnostics={diagnostics}
            outputEntries={outputEntries}
            onActivePanelTabChange={(tab) => {
              if (tab === "terminal") {
                setBottomPanelOpen(false);
                setTerminalOpen(true);
                return;
              }
              setBottomPanelTab(tab);
              setBottomPanelOpen(true);
              setTerminalOpen(false);
            }}
            onHide={() => {
              setTerminalOpen(false);
              setBottomPanelOpen(false);
            }}
            onOpenDiagnostic={handleOpenDiagnostic}
            onRefreshDiagnostics={() =>
              runCommand(AXON_COMMANDS.REFRESH_DIAGNOSTICS)
            }
            onClearOutput={() => runCommand(AXON_COMMANDS.CLEAR_OUTPUT)}
          />
        </div>

        {!zenMode && settings.ai.enabled && agentSidebarOpen && (
          <AxonAgentSidebar onClose={() => setAgentSidebarOpen(false)} />
        )}
      </div>

      {!zenMode && (
        <StatusBar
          activeFile={activePane?.activeFile ?? null}
          hasWorkspace={!!folderPath}
          language={language}
          cursor={cursorInfo}
          sidebarCollapsed={sidebarCollapsed}
          terminalOpen={terminalOpen}
          aiEnabled={settings.ai.enabled}
          agentSidebarOpen={agentSidebarOpen}
          bottomPanelOpen={bottomPanelOpen}
          bottomPanelTab={bottomPanelTab}
          problemCount={diagnosticCounts.total}
          errorCount={diagnosticCounts.error}
          warningCount={diagnosticCounts.warning}
          gitBranch={gitStatus?.branch ?? null}
          gitChangeCount={gitChangeCount}
          themeTokens={themeTokens}
          onToggleSidebar={() => setSidebarCollapsed((p) => !p)}
          onOpenWorkspaceSearch={() =>
            runCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH)
          }
          onToggleTerminal={() => runCommand(AXON_COMMANDS.TOGGLE_TERMINAL)}
          onToggleAgentSidebar={() => setAgentSidebarOpen((open) => !open)}
          onOpenBottomPanel={(tab) =>
            runCommand(
              tab === "problems"
                ? AXON_COMMANDS.OPEN_PROBLEMS_PANEL
                : AXON_COMMANDS.OPEN_OUTPUT_PANEL,
            )
          }
          onOpenSourceControl={() =>
            runCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL)
          }
          view={sidebarView}
          onViewChange={(nextView) => {
            setSidebarView(nextView);
            setSidebarCollapsed(false);
          }}
        />
      )}

      <CommandPalette
        tree={tree}
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        onFileSelect={handleFileSelect}
        onCommandSelect={runCommand}
      />

      <WorkspaceSearchModal
        rootPath={folderPath}
        open={workspaceSearchOpen}
        onClose={() => setWorkspaceSearchOpen(false)}
        onResultSelect={handleWorkspaceSearchResult}
      />

      <TaskRunnerModal
        folderPath={folderPath}
        open={taskRunnerOpen}
        onClose={() => setTaskRunnerOpen(false)}
        onRunTask={(task) => void handleRunWorkspaceTask(task)}
      />

      <FileOutlineModal
        open={fileOutlineOpen}
        filePath={activePane?.activeFile ?? null}
        symbols={activeFileSymbols}
        onClose={() => setFileOutlineOpen(false)}
        onSelect={(symbol) => {
          const activeFile = activePane?.activeFile;
          if (!activeFile) return;
          handleOpenNavigationTarget({
            path: activeFile,
            line: symbol.line,
            column: symbol.column,
            length: Math.max(1, symbol.name.length),
          });
        }}
      />

      {settingsOpen && (
        <SettingsModal
          folderPath={folderPath}
          extensionState={extensionState}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onPreview={handleSettingsPreview}
          onSave={handleSettingsSave}
          onViewLogs={() => {
            setSettingsOpen(false);
            setBottomPanelTab("output");
            setBottomPanelOpen(true);
            setTerminalOpen(false);
          }}
        />
      )}

      {extensionsOpen && (
        <ExtensionsModal
          folderPath={folderPath}
          extensionState={extensionState}
          onExtensionsChanged={setExtensionState}
          onClose={() => setExtensionsOpen(false)}
        />
      )}

      {aboutOpen && (
        <AboutModal
          updateInfo={updateInfo}
          onOpenUpdatePage={() => setUpdateModalOpen(true)}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {updateModalOpen && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          installState={updateInstallState}
          onClose={() => setUpdateModalOpen(false)}
          onDownloadUpdate={handleDownloadUpdate}
          onInstallUpdate={handleInstallUpdate}
          onOpenUpdatePage={handleOpenUpdatePage}
        />
      )}

      {diffOpen && (diffFilePath || activePane?.activeFile) && (
        <DiffModal
          filePath={diffFilePath ?? activePane?.activeFile ?? ""}
          folderPath={folderPath}
          editorSettings={settings.editor}
          themeTokens={themeTokens}
          onClose={() => {
            setDiffOpen(false);
            setDiffFilePath(null);
          }}
        />
      )}

      <SourceControlModal
        folderPath={folderPath}
        open={sourceControlOpen}
        onClose={() => setSourceControlOpen(false)}
        onOpenFile={handleFileSelect}
        onOpenDiff={(path) => {
          setDiffFilePath(path);
          setDiffOpen(true);
        }}
        onGitStatusChanged={() => void refreshGitStatus({ silent: true })}
        editorSettings={settings.editor}
        themeTokens={themeTokens}
        onOutput={(message, level = "info") =>
          appendOutput("git", message, level)
        }
      />

      {loading && !splashVisible && <WorkspaceLoadingOverlay />}
      {splashVisible && <SplashScreen leaving={splashLeaving} />}
    </div>
  );
}

export default App;
