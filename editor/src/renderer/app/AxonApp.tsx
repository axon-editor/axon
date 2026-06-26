import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Sidebar, {
  addRecentFolder,
  getWorkspaceTrustState,
  setWorkspaceTrusted,
} from "../features/sidebar";
import EditorPane from "../features/editor/EditorPane";
import StatusBar from "../shared/components/StatusBar";
import Terminal from "../features/terminal/Terminal";
import CommandPalette, {
  type CommandPaletteCommand,
} from "../features/search/CommandPalette";
import WorkspaceSearchModal from "../features/search/WorkspaceSearchModal";
import {
  type BottomPanelTab,
  type OutputEntry,
  type OutputEntryLevel,
} from "../features/terminal/BottomPanel";
import DiffModal from "../features/git/DiffModal";
import EditorToolbar from "../features/editor/EditorToolbar";
import SettingsModal from "../features/settings";
import ExtensionsModal from "../features/extensions";
import SplashScreen from "../shared/components/SplashScreen";
import AboutModal from "../shared/components/AboutModal";
import SourceControlModal from "../features/git/SourceControlModal";
import TaskRunnerModal from "../features/tasks/TaskRunnerModal";
import TestExplorerModal from "../features/tests/TestExplorerModal";
import WorkspaceOverviewModal from "../features/workspace/WorkspaceOverviewModal";
import LanguageToolsModal from "../features/lsp/LanguageToolsModal";
import FileOutlineModal from "../features/search/FileOutlineModal";
import UpdateModal from "../features/updates/UpdateModal";
import GitHistoryEditor from "../features/git/GitHistoryEditor";
import { useSpotify } from "../features/spotify/lib/useSpotify";
import WorkspaceLoadingOverlay from "../shared/components/WorkspaceLoadingOverlay";
import {
  getTree,
  createFile,
  writeFile,
  type FileNode,
  type WorkspaceSearchResult,
} from "../shared/lib/api";
import {
  clearLanguageServerDiagnosticsFromMonaco,
  onEditorDiagnosticsChanged,
  syncLanguageServerDiagnosticsToMonaco,
  type EditorDiagnostic,
} from "../features/diagnostics/lib/diagnostics";
import { useAgentDiagnosticsExport } from "../features/diagnostics/lib/useAgentDiagnosticsExport";
import {
  capDiagnostics,
  isDiagnosticInWorkspace,
  MAX_PROJECT_DIAGNOSTICS,
  updateLspDiagnosticCache,
  type LspDiagnosticsByFile,
} from "../features/diagnostics/lib/diagnosticCache";
import {
  createInitialLayout,
  splitPane,
  openFileInPane,
  closeTabInPane,
  closePane,
  reorderTabsInPane,
  setDirtyInPane,
  moveTabBetweenPanes,
  removePathFromLayout,
  replacePathInLayout,
  setPinnedInPane,
} from "../features/editor/lib/layoutManager";
import { type Layout, type SplitDirection } from "../features/editor/lib/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../../shared/commands";
import { type AiActionId } from "../../shared/ai";
import {
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
  type GitStatusResult,
} from "../../shared/git";
import { type WorkspaceTask } from "../../shared/tasks";
import { type LanguageServerTextEdit } from "../../shared/lsp";
import { type UpdateInfo, type UpdateInstallState } from "../../shared/updates";
import { type ExtensionState } from "../../shared/extensions";
import { type AgentResumeRequest } from "../../shared/app";
import {
  createThemeCssVariables,
  resolveThemeTokens,
} from "../shared/lib/themeTokens";
import { registerAxonTheme } from "../shared/lib/soraTheme";
import { type EditorNavigationTarget } from "../features/editor/lib/navigation";
import { useGlobalEditorShortcuts } from "../features/editor/shortcuts/useGlobalEditorShortcuts";
import { fontStack } from "../shared/lib/fonts";
import { createBundledFontFaces } from "../shared/lib/bundledFonts";
import {
  createHtmlPreviewTabPath,
  isHtmlFile,
} from "../features/preview/lib/htmlPreviewTabs";
import {
  loadWorkspaceSession,
  sanitizeRestoredLayout,
  saveWorkspaceSession,
  type WorkspaceSession,
} from "../shared/lib/workspaceSession";
import {
  createWorkspaceRoot,
  upsertWorkspaceRoot,
  type WorkspaceRoot,
} from "../shared/lib/workspaceRoots";
import {
  detectLanguage,
  detectLanguageServerLanguage,
  getModel,
} from "../features/editor/lib/monacoModels";
import {
  collectFileSymbols,
  type FileSymbol,
} from "../features/sidebar/files/lib/fileSymbols";
import "../App.css";
import * as monaco from "monaco-editor";
import SpotifyFloatingPlayer from "../features/spotify/SpotifyFloatingPlayer";
import AxonAgentSidebar from "../features/agent/AxonAgentSidebar";
import CliToolInstallPrompt from "../features/cli/CliToolInstallPrompt";
import { useCliToolInstallPrompt } from "../features/cli/useCliToolInstallPrompt";

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

function getPathBasename(path: string | null) {
  if (!path) return "workspace";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "workspace";
}

function toMonacoEdit(edit: LanguageServerTextEdit) {
  return {
    range: new monaco.Range(
      edit.range.start.line + 1,
      edit.range.start.character + 1,
      edit.range.end.line + 1,
      edit.range.end.character + 1,
    ),
    text: edit.newText,
    forceMoveMarkers: true,
  };
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [workspaceRoots, setWorkspaceRoots] = useState<WorkspaceRoot[]>([]);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
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
  const [workspaceOverviewOpen, setWorkspaceOverviewOpen] = useState(false);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [taskRunnerOpen, setTaskRunnerOpen] = useState(false);
  const [testExplorerOpen, setTestExplorerOpen] = useState(false);
  const [languageToolsOpen, setLanguageToolsOpen] = useState(false);
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
  const [workspaceTrustPromptPath, setWorkspaceTrustPromptPath] = useState<
    string | null
  >(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateInstallState, setUpdateInstallState] =
    useState<UpdateInstallState>({ phase: "idle" });
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsJsonPath, setSettingsJsonPath] = useState<string | null>(null);
  const [availableFonts, setAvailableFonts] = useState<CustomFont[]>([]);
  const [extensionState, setExtensionState] = useState<ExtensionState | null>(
    null,
  );
  const [monacoDiagnostics, setMonacoDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [lspDiagnosticsByFile, setLspDiagnosticsByFile] =
    useState<LspDiagnosticsByFile>({});
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
  const folderRefreshTimerRef = useRef<number | null>(null);
  const folderRefreshRequestRef = useRef(0);
  const updateAutoDownloadVersionRef = useRef<string | null>(null);
  const activeLanguageServerStartRef = useRef<Set<string>>(new Set());
  const [spotifyPlayerOpen, setSpotifyPlayerOpen] = useState(false);
  const [agentSidebarOpen, setAgentSidebarOpen] = useState(false);
  const [agentResumeRequest, setAgentResumeRequest] =
    useState<AgentResumeRequest | null>(null);
  const [agentResumeRequested, setAgentResumeRequested] = useState(false);
  const [agentActionRequest, setAgentActionRequest] = useState<{
    action: AiActionId;
    nonce: number;
  } | null>(null);
  const cliToolInstallPrompt = useCliToolInstallPrompt();
  const [workspaceTrustNonce, setWorkspaceTrustNonce] = useState(0);

  const sidebarSpotifyVisible = sidebarView === "spotify" && !sidebarCollapsed;
  const [spotifyState, spotifyActions] = useSpotify(sidebarSpotifyVisible);

  useEffect(() => {
    window.axonEditorSettings = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadResumeRequest() {
      try {
        const request = await window.axon.getAgentResumeRequest();
        if (!cancelled && request) {
          setAgentResumeRequest(request);
          setAgentResumeRequested(true);
          setAgentSidebarOpen(true);
        }
      } catch (err) {
        console.error("failed to load agent resume request:", err);
      }
    }

    void loadResumeRequest();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.axon.onAgentResumeRequest((request) => {
      setAgentResumeRequest(request);
      setAgentResumeRequested(true);
      setAgentSidebarOpen(true);
    });
  }, []);

  useEffect(() => {
    window.axon
      .listAvailableFonts()
      .then(setAvailableFonts)
      .catch((err) => {
        console.error("failed to list available fonts:", err);
        setAvailableFonts([]);
      });
  }, []);

  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);
  const workspaceTrusted = useMemo(
    () => getWorkspaceTrustState(folderPath) !== false,
    [folderPath, workspaceTrustNonce],
  );

  useEffect(() => {
    setWorkspaceRoots((currentRoots) =>
      currentRoots.map((root) => ({
        ...root,
        trusted: getWorkspaceTrustState(root.path),
      })),
    );
  }, [workspaceTrustNonce]);

  useEffect(() => {
    if (workspaceTrusted || !folderPath) return;

    setTerminalOpen(false);
    setTaskRunnerOpen(false);
    setExtensionsOpen(false);
    setAgentSidebarOpen(false);
    activeLanguageServerStartRef.current.clear();
    void window.axon.stopLanguageServers(folderPath).catch((err) => {
      console.error(
        "failed to stop language servers for untrusted workspace:",
        err,
      );
    });
  }, [folderPath, workspaceTrusted]);
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
      "--axon-sidebar-border": colorWithAlpha(
        themeTokens["sidebar.border"],
        Math.min(1, opacity + 0.25),
      ),
      "--axon-tab-active-background": colorWithAlpha(
        themeTokens["tab.active_background"],
        opacity,
      ),
      "--axon-panel-background": colorWithAlpha(
        themeTokens["panel.background"],
        opacity,
      ),
      "--axon-panel-border": colorWithAlpha(
        themeTokens["panel.border"],
        Math.min(1, opacity + 0.25),
      ),
      "--axon-panel-overlay-hover": colorWithAlpha(
        themeTokens["panel.overlay_hover"],
        Math.min(1, opacity + 0.2),
      ),
      "--axon-status-bar-background": colorWithAlpha(
        themeTokens["status_bar.background"],
        opacity,
      ),
      "--axon-editor-background": colorWithAlpha(
        themeTokens["editor.background"],
        opacity,
      ),
      "--axon-editor-gutter-background": colorWithAlpha(
        themeTokens["editor.gutter.background"],
        opacity,
      ),
      "--axon-terminal-background": colorWithAlpha(
        themeTokens["terminal.background"],
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
    ].filter((diagnostic) => isDiagnosticInWorkspace(diagnostic, folderPath));
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
  }, [folderPath, lspDiagnosticsByFile, monacoDiagnostics, projectDiagnostics]);

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

  useAgentDiagnosticsExport({ folderPath, diagnostics });

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

  const activeFileSymbols = useMemo<FileSymbol[]>(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return [];
    const model = getModel(activeFile);
    if (!model || model.isDisposed()) return [];
    return collectFileSymbols(model.getValue());
  }, [activePane?.activeFile, layout]);
  const activeFileContent = useMemo(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return "";
    const model = getModel(activeFile);
    return model && !model.isDisposed() ? model.getValue() : "";
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

  const requireTrustedWorkspace = useCallback(
    (feature: string) => {
      if (workspaceTrusted) return true;

      appendOutput(
        "workspace",
        `${feature} is disabled until this workspace is trusted.`,
        "warning",
      );
      setWorkspaceTrustPromptPath(folderPath);
      return false;
    },
    [appendOutput, folderPath, workspaceTrusted],
  );

  useEffect(() => {
    if (
      !folderPath ||
      !settings.lsp.enabled ||
      !workspaceTrusted ||
      !activePane?.activeFile
    ) {
      return;
    }

    const languageId = detectLanguageServerLanguage(activePane.activeFile);
    const startKey = `${folderPath}::${languageId}`;
    if (activeLanguageServerStartRef.current.has(startKey)) return;
    if (!window.axon.startLanguageServerForLanguage) return;
    activeLanguageServerStartRef.current.add(startKey);

    const startTimer = window.setTimeout(() => {
      window.axon
        .startLanguageServerForLanguage({ folderPath, languageId })
        .then((result) => {
          if (result.message.startsWith("No external language server")) return;
          // Language servers should come online after the editor shell and the
          // first file are usable. Starting every relevant server during
          // workspace restore made startup compete with file-tree rendering,
          // Git status, diagnostics, and Monaco on older 8GB Intel machines.
          // This delayed, active-file-only path keeps completions available
          // without turning project open into a background process storm.
          if (!result.ok) {
            activeLanguageServerStartRef.current.delete(startKey);
          }
          appendOutput("lsp", result.message, result.ok ? "success" : "error");
        })
        .catch((err) => {
          // IPC errors are transient from the renderer's point of view. If the
          // key stayed locked here, one failed bridge call would permanently
          // block the next active-file change from starting the server again.
          activeLanguageServerStartRef.current.delete(startKey);
          appendOutput(
            "lsp",
            err instanceof Error
              ? err.message
              : "Failed to start language server.",
            "error",
          );
        });
    }, 900);

    return () => window.clearTimeout(startTimer);
  }, [
    activePane?.activeFile,
    appendOutput,
    folderPath,
    settings.lsp.enabled,
    workspaceTrusted,
  ]);

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
      setProjectDiagnostics(
        capDiagnostics(nextDiagnostics, MAX_PROJECT_DIAGNOSTICS),
      );
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
    if (!settingsHydrated || !sessionReady || loading) return;

    // The splash should protect startup work, not run as a decorative timer.
    // It stays visible while settings and session restore are still resolving,
    // then exits as soon as the app can show the real editor shell.
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), 90);
    const removeTimer = window.setTimeout(() => setSplashVisible(false), 610);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [loading, sessionReady, settingsHydrated]);

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
    const allCustomFonts = [...availableFonts, ...settings.customFonts];
    const customFontFaces = allCustomFonts
      .map((font) => {
        const family = escapeCssString(font.family);
        const url = escapeCssString(font.url);
        const weight = font.weight ? `font-weight:${font.weight};` : "";
        const style = font.style ? `font-style:${font.style};` : "";
        const stretch = font.stretch ? `font-stretch:${font.stretch};` : "";
        return `@font-face{font-family:"${family}";src:url("${url}");${weight}${style}${stretch}font-display:swap;}`;
      })
      .join("\n");

    styleElement.textContent = [createBundledFontFaces(), customFontFaces]
      .filter(Boolean)
      .join("\n");
  }, [availableFonts, settings.customFonts]);

  useEffect(() => {
    return onEditorDiagnosticsChanged(setMonacoDiagnostics);
  }, []);

  useEffect(() => {
    setProjectDiagnostics([]);
  }, [folderPath]);

  useEffect(() => {
    setLspDiagnosticsByFile({});
    clearLanguageServerDiagnosticsFromMonaco();
    if (!folderPath || !settings.lsp.enabled) return;

    // LSP diagnostics arrive asynchronously from whichever server owns the
    // changed document. Keeping them keyed by file lets a server clear one
    // file's diagnostics without wiping problems from another language server.
    return window.axon.onLanguageServerDiagnostics((event) => {
      if (event.folderPath !== folderPath) return;
      setLspDiagnosticsByFile((current) =>
        updateLspDiagnosticCache(
          current,
          event.filePath,
          event.serverId,
          event.diagnostics,
        ),
      );
    });
  }, [folderPath, settings.lsp.enabled]);

  useEffect(() => {
    const diagnosticsByFile = Object.values(lspDiagnosticsByFile)
      .flat()
      .reduce<Record<string, EditorDiagnostic[]>>(
        (nextDiagnostics, diagnostic) => {
          nextDiagnostics[diagnostic.path] = [
            ...(nextDiagnostics[diagnostic.path] ?? []),
            diagnostic,
          ];
          return nextDiagnostics;
        },
        {},
      );

    syncLanguageServerDiagnosticsToMonaco(diagnosticsByFile);
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
        if (workspaceTrusted) {
          void refreshProjectDiagnostics();
        }
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
      if (workspaceTrusted) {
        void refreshProjectDiagnostics();
      }
      void refreshGitStatus({ silent: true });
    };

    window.addEventListener("axon:fileSaved", handleFileSaved);
    return () => window.removeEventListener("axon:fileSaved", handleFileSaved);
  }, [
    folderPath,
    refreshGitStatus,
    refreshProjectDiagnostics,
    settingsJsonPath,
    workspaceTrusted,
  ]);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged(() => {
      if (!folderPath) return;
      if (folderRefreshTimerRef.current) {
        window.clearTimeout(folderRefreshTimerRef.current);
      }

      folderRefreshTimerRef.current = window.setTimeout(() => {
        const requestId = folderRefreshRequestRef.current + 1;
        folderRefreshRequestRef.current = requestId;

        getTree(folderPath)
          .then((nextTree) => {
            if (folderRefreshRequestRef.current === requestId) {
              setTree(nextTree);
            }
          })
          .catch(console.error);
        void refreshGitStatus({ silent: true });
      }, 90);
    });
    return () => {
      cleanup();
      if (folderRefreshTimerRef.current) {
        window.clearTimeout(folderRefreshTimerRef.current);
        folderRefreshTimerRef.current = null;
      }
    };
  }, [folderPath, refreshGitStatus]);

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

  const handleSwitchWorkspaceRoot = async (path: string) => {
    if (path === folderPath) return;

    try {
      setLoading(true);
      appendOutput("workspace", `Switching to ${path}`);
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await handleFolderChange(path, fileTree, {
        folderPath: path,
        roots: workspaceRoots,
        activeRootId:
          workspaceRoots.find((root) => root.path === path)?.id ?? path,
        layout: createInitialLayout(),
        sidebarCollapsed,
        sidebarWidth,
        terminalOpen,
        bottomPanelOpen,
        bottomPanelTab,
      });
      appendOutput("workspace", `Switched to ${path}`, "success");
    } catch (err) {
      console.error("failed to switch workspace root:", err);
      appendOutput("workspace", "Failed to switch workspace root.", "error");
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
      roots: workspaceRoots,
      activeRootId,
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
    activeRootId,
    folderPath,
    layout,
    sessionReady,
    sidebarCollapsed,
    sidebarWidth,
    terminalOpen,
    workspaceRoots,
  ]);

  const handleFolderChange = async (
    path: string,
    fileTree: FileNode,
    restoredSession?: WorkspaceSession | null,
  ) => {
    allowSessionPersistenceRef.current = true;
    const restoredRoots =
      restoredSession?.roots && restoredSession.roots.length > 0
        ? restoredSession.roots
        : [];
    const nextRoots =
      restoredRoots.length > 0
        ? upsertWorkspaceRoot(restoredRoots, path, getWorkspaceTrustState(path))
        : upsertWorkspaceRoot(
            workspaceRoots,
            path,
            getWorkspaceTrustState(path),
          );
    const nextActiveRoot =
      nextRoots.find((root) => root.path === path) ?? createWorkspaceRoot(path);

    setWorkspaceRoots(nextRoots);
    setActiveRootId(nextActiveRoot.id);
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
    if (getWorkspaceTrustState(path) === null) {
      setWorkspaceTrustPromptPath(path);
    }

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
    if (!requireTrustedWorkspace("HTML preview")) return;

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

  const handleApplyAgentEdit = useCallback(
    async (filePath: string, content: string) => {
      await writeFile(filePath, content);
      handleFileSelect(filePath);
      await handleRefresh();
      appendOutput("ai", `Applied Axon edit to ${filePath}`, "success");
    },
    [appendOutput],
  );

  const handleSettingsSave = useCallback(async (
    nextSettings: AxonSettings,
    options: { announce?: boolean } = { announce: true },
  ) => {
    const normalizedSettings = normalizeSettings(nextSettings);
    setSettings(normalizedSettings);

    try {
      const savedSettings = await window.axon.updateSettings(
        normalizedSettings,
        null,
      );
      setSettings(normalizeSettings(savedSettings));
      if (options.announce !== false) {
        appendOutput("settings", "Saved settings.", "success");
      }
    } catch (err) {
      console.error("failed to save settings:", err);
      appendOutput("settings", "Failed to save settings.", "error");
    }
  }, [appendOutput]);

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
          ? (orderedDiagnostics.find(
              (diagnostic) => compareWithAnchor(diagnostic) > 0,
            ) ?? orderedDiagnostics[0])
          : ([...orderedDiagnostics]
              .reverse()
              .find((diagnostic) => compareWithAnchor(diagnostic) < 0) ??
            orderedDiagnostics[orderedDiagnostics.length - 1]);

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
    if (!requireTrustedWorkspace("Terminal")) return;

    setTerminalCreateWorkingDirectory(null);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
    appendOutput("terminal", "Created terminal tab.");
  };

  const handleOpenTabInTerminal = (filePath: string) => {
    if (!requireTrustedWorkspace("Terminal")) return;

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
    if (!requireTrustedWorkspace("Terminal")) return;

    setTerminalCreateWorkingDirectory(path);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
    appendOutput("terminal", `Opening terminal at ${path}.`);
  };

  const handleRunWorkspaceTask = async (task: WorkspaceTask) => {
    if (!folderPath) return;
    if (!requireTrustedWorkspace("Tasks")) return;

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
      const languageId = detectLanguageServerLanguage(filePath);

      if (
        settings.editor.formatOnSave &&
        folderPath &&
        workspaceTrusted &&
        languageId !== "plaintext"
      ) {
        try {
          const modelOptions = model.getOptions();
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath,
            languageId,
            content: model.getValue(),
            tabSize: modelOptions.tabSize,
            insertSpaces: modelOptions.insertSpaces,
          });

          if (result.ok && result.edits.length > 0) {
            // Format-on-save works on the shared Monaco model before the disk
            // write so every split showing this file receives the same edits.
            // Formatting a detached string instead would let the saved text and
            // the visible editor drift until the next model refresh.
            model.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
          } else if (!result.ok && result.message) {
            appendOutput("lsp", result.message, "warning");
          }
        } catch (err) {
          appendOutput(
            "lsp",
            err instanceof Error ? err.message : "Format on save failed.",
            "warning",
          );
        }
      }

      await writeFile(filePath, model.getValue());
      if (folderPath && workspaceTrusted) {
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
            // is unavailable. Axon still pushes the latest saved content into
            // LSP immediately so diagnostics refresh from the same text that
            // hit disk, then falls back to the normal server reconnect/output
            // path if the sync bridge is not ready yet.
            console.error(
              "failed to sync saved file with language server:",
              err,
            );
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
      return true;
    },
    [appendOutput, folderPath, settings.editor.formatOnSave],
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
        if (!requireTrustedWorkspace("Extension commands")) return;

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
        case AXON_COMMANDS.OPEN_WORKSPACE_OVERVIEW:
          setWorkspaceOverviewOpen(true);
          break;
        case AXON_COMMANDS.OPEN_WORKSPACE_SEARCH:
          setWorkspaceSearchOpen((prev) => !prev);
          break;
        case AXON_COMMANDS.OPEN_TASK_RUNNER:
          if (!requireTrustedWorkspace("Tasks")) break;
          setTaskRunnerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_TEST_EXPLORER:
          if (!requireTrustedWorkspace("Tests")) break;
          setTestExplorerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_FILE_OUTLINE:
          setFileOutlineOpen(true);
          break;
        case AXON_COMMANDS.OPEN_LANGUAGE_TOOLS:
          setLanguageToolsOpen(true);
          break;
        case AXON_COMMANDS.GO_TO_DEFINITION:
          if (!requireTrustedWorkspace("Language server navigation")) break;
          runEditorAction("definition");
          break;
        case AXON_COMMANDS.FIND_REFERENCES:
          if (!requireTrustedWorkspace("Language server navigation")) break;
          runEditorAction("references");
          break;
        case AXON_COMMANDS.RENAME_SYMBOL:
          if (!requireTrustedWorkspace("Language server features")) break;
          runEditorAction("rename");
          break;
        case AXON_COMMANDS.FORMAT_DOCUMENT:
          if (!requireTrustedWorkspace("Language server features")) break;
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
          if (!requireTrustedWorkspace("Language server diagnostics")) break;
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
          if (!requireTrustedWorkspace("Terminal")) break;
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
          if (!requireTrustedWorkspace("Extensions")) break;
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
        case AXON_COMMANDS.ASK_AXON:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({ action: "ask", nonce: Date.now() });
          break;
        case AXON_COMMANDS.AI_EXPLAIN_SELECTION:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "explain-selection",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_FIX_PROBLEM:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({ action: "fix-problem", nonce: Date.now() });
          break;
        case AXON_COMMANDS.AI_REFACTOR_SELECTION:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "refactor-selection",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_GENERATE_TESTS:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "generate-tests",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_REVIEW_GIT_DIFF:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "review-git-diff",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_DRAFT_COMMIT_MESSAGE:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "draft-commit-message",
            nonce: Date.now(),
          });
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
      requireTrustedWorkspace,
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
              subtitle: !workspaceTrusted
                ? "Trust this workspace before running extension commands"
                : (command.description ??
                  `${extension.name} command contribution`),
              keywords: [extension.name, extension.publisher, command.id],
              disabled: !workspaceTrusted,
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
        id: AXON_COMMANDS.OPEN_WORKSPACE_OVERVIEW,
        title: "Workspace Overview",
        group: "Workspace",
        subtitle:
          workspaceRoots.length > 1
            ? `${workspaceRoots.length} workspace roots`
            : folderPath
              ? "Show root status, problems, tests, and Git"
              : "Open a folder first",
        keywords: ["workspace", "roots", "multi-root", "project"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_TASK_RUNNER,
        title: "Run Task",
        group: "Workspace",
        subtitle: !workspaceTrusted
          ? "Trust this workspace before running tasks"
          : folderPath
            ? "Run package, Go, or Cargo workspace tasks"
            : "Open a folder first",
        keywords: ["build", "test", "npm", "go", "cargo"],
        disabled: !folderPath || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_TEST_EXPLORER,
        title: "Test Explorer",
        group: "Workspace",
        subtitle: !workspaceTrusted
          ? "Trust this workspace before running tests"
          : folderPath
            ? "Discover and run local project tests"
            : "Open a folder first",
        keywords: ["test", "vitest", "jest", "pytest", "go", "cargo"],
        disabled: !folderPath || !workspaceTrusted,
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
        id: AXON_COMMANDS.OPEN_LANGUAGE_TOOLS,
        title: "Language Tools",
        group: "Language",
        subtitle: activePane?.activeFile
          ? `LSP actions for ${language}`
          : "Select a file first",
        keywords: ["lsp", "code actions", "symbols", "rename", "format"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.GO_TO_DEFINITION,
        title: "Go to Definition",
        group: "Navigation",
        shortcut: "F12",
        subtitle: activePane?.activeFile
          ? workspaceTrusted
            ? "Jump to the symbol definition Monaco can resolve"
            : "Trust this workspace before using language server navigation"
          : "Select a file first",
        keywords: ["definition", "symbol", "jump"],
        disabled: !activePane?.activeFile || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.FIND_REFERENCES,
        title: "Find References",
        group: "Navigation",
        shortcut: "Shift F12",
        subtitle: activePane?.activeFile
          ? workspaceTrusted
            ? "Show usages for the current symbol"
            : "Trust this workspace before using language server navigation"
          : "Select a file first",
        keywords: ["references", "usages", "symbol"],
        disabled: !activePane?.activeFile || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.RENAME_SYMBOL,
        title: "Rename Symbol",
        group: "Navigation",
        subtitle: activePane?.activeFile
          ? workspaceTrusted
            ? "Rename the current symbol through the active language server"
            : "Trust this workspace before using language server actions"
          : "Select a file first",
        keywords: ["rename", "symbol", "refactor"],
        disabled: !activePane?.activeFile || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.FORMAT_DOCUMENT,
        title: "Format Document",
        group: "Editor",
        subtitle: activePane?.activeFile
          ? workspaceTrusted
            ? "Format the active file through the active language server"
            : "Trust this workspace before using language server actions"
          : "Select a file first",
        keywords: ["format", "pretty", "indent"],
        disabled: !activePane?.activeFile || !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.OPEN_HTML_PREVIEW,
        title: "Open HTML Preview",
        group: "Preview",
        subtitle:
          activePane?.activeFile && isHtmlFile(activePane.activeFile)
            ? workspaceTrusted
              ? "Open the active HTML file in Axon's preview tab"
              : "Trust this workspace before running HTML preview"
            : "Select an HTML file first",
        keywords: ["browser", "live", "preview", "web"],
        disabled:
          !activePane?.activeFile ||
          !isHtmlFile(activePane.activeFile) ||
          !workspaceTrusted,
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
          ? workspaceTrusted
            ? "Run project diagnostics for the current workspace"
            : "Trust this workspace before running diagnostics"
          : "Open a folder first",
        keywords: ["diagnostics", "check", "errors", "lint"],
        disabled: !folderPath || !workspaceTrusted,
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
        subtitle: workspaceTrusted
          ? "Toggle the terminal panel"
          : "Trust this workspace before opening a terminal",
        keywords: ["shell", "console"],
        disabled: !workspaceTrusted,
      },
      {
        id: AXON_COMMANDS.NEW_TERMINAL,
        title: "New Terminal",
        group: "Terminal",
        subtitle: workspaceTrusted
          ? "Create a terminal tab"
          : "Trust this workspace before creating a terminal",
        keywords: ["shell", "pty"],
        disabled: !workspaceTrusted,
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
        id: AXON_COMMANDS.ASK_AXON,
        title: "Ask Axon",
        group: "AI",
        subtitle: settings.ai.enabled
          ? "Open project-aware local assistant"
          : "Enable Axon Agent in settings",
        keywords: ["ai", "agent", "chat", "local model"],
        disabled: !settings.ai.enabled,
      },
      {
        id: AXON_COMMANDS.AI_EXPLAIN_SELECTION,
        title: "AI: Explain Active File",
        group: "AI",
        subtitle: activePane?.activeFile
          ? "Explain the active code with project context"
          : "Open a file first",
        keywords: ["ai", "explain", "selection", "code"],
        disabled: !settings.ai.enabled || !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.AI_FIX_PROBLEM,
        title: "AI: Fix Problem",
        group: "AI",
        subtitle:
          diagnostics.length > 0
            ? `${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"} in context`
            : "No current problems",
        keywords: ["ai", "fix", "diagnostic", "problem"],
        disabled: !settings.ai.enabled || diagnostics.length === 0,
      },
      {
        id: AXON_COMMANDS.AI_REFACTOR_SELECTION,
        title: "AI: Refactor Active File",
        group: "AI",
        subtitle: activePane?.activeFile
          ? "Prepare a safer refactor proposal"
          : "Open a file first",
        keywords: ["ai", "refactor", "cleanup"],
        disabled: !settings.ai.enabled || !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.AI_GENERATE_TESTS,
        title: "AI: Generate Tests",
        group: "AI",
        subtitle: activePane?.activeFile
          ? "Create test ideas or an edit proposal"
          : "Open a file first",
        keywords: ["ai", "test", "coverage"],
        disabled: !settings.ai.enabled || !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.AI_REVIEW_GIT_DIFF,
        title: "AI: Review Git Diff",
        group: "AI",
        subtitle:
          gitChangeCount > 0
            ? `${gitChangeCount} changed file${gitChangeCount === 1 ? "" : "s"}`
            : "No Git changes",
        keywords: ["ai", "review", "diff", "git"],
        disabled: !settings.ai.enabled || gitChangeCount === 0,
      },
      {
        id: AXON_COMMANDS.AI_DRAFT_COMMIT_MESSAGE,
        title: "AI: Draft Commit Message",
        group: "AI",
        subtitle:
          gitChangeCount > 0
            ? "Write a commit message for current changes"
            : "No Git changes",
        keywords: ["ai", "commit", "message", "git"],
        disabled: !settings.ai.enabled || gitChangeCount === 0,
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
        subtitle: workspaceTrusted
          ? "Manage local extension packages and contributed themes"
          : "Trust this workspace before activating extensions",
        keywords: ["plugins", "themes", "syntax", "packages"],
        disabled: !workspaceTrusted,
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
    language,
    settings.ai.enabled,
    terminalOpen,
    updateInfo?.latestVersion,
    updateInfo?.updateAvailable,
    workspaceRoots.length,
    workspaceTrusted,
    zenMode,
  ]);

  useEffect(() => {
    window.axonCompletionWorkspacePath = workspaceTrusted ? folderPath : null;
  }, [folderPath, workspaceTrusted]);

  useEffect(() => {
    const cleanup = window.axon.onMenuCommand(runCommand);

    return cleanup;
  }, [runCommand]);

  useGlobalEditorShortcuts({
    settings,
    zenMode,
    runCommand,
    onSaveSettings: handleSettingsSave,
    onSetZenMode: setZenMode,
  });

  return (
    <div
      className="axon-app-root flex flex-col h-screen w-screen overflow-hidden relative"
      style={{
        ...appThemeCssVariables,
        background: "var(--axon-background)",
        backdropFilter:
          settings.editor.appTransparency &&
          settings.editor.appBackgroundBlur > 0
            ? `blur(${settings.editor.appBackgroundBlur}px)`
            : undefined,
        WebkitBackdropFilter:
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
            workspaceRoots={workspaceRoots}
            activeRootId={activeRootId}
            activeFile={activePane?.activeFile ?? null}
            onFileSelect={handleFileSelect}
            onOpenFolder={handleOpenFolder}
            onFolderChange={handleFolderChange}
            onSwitchWorkspaceRoot={handleSwitchWorkspaceRoot}
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
            spotifyState={spotifyState}
            spotifyActions={spotifyActions}
            playerOpen={spotifyPlayerOpen}
            onTogglePlayer={() => setSpotifyPlayerOpen((p) => !p)}
            onWorkspaceTrustChanged={() =>
              setWorkspaceTrustNonce((nonce) => nonce + 1)
            }
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
              style={
                {
                  background: "var(--axon-toolbar-background)",
                  borderColor: "var(--axon-panel-border)",
                  WebkitAppRegion: "drag",
                } as React.CSSProperties
              }
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

          {workspaceTrusted ? (
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
          ) : null}
        </div>

        {!zenMode && settings.ai.enabled && agentSidebarOpen && (
          <AxonAgentSidebar
            activeFileContent={activeFileContent}
            activeFileLanguage={
              activePane?.activeFile
                ? detectLanguage(activePane.activeFile)
                : "plaintext"
            }
            activeFilePath={activePane?.activeFile ?? null}
            diagnostics={diagnostics}
            folderPath={folderPath}
            gitChanges={gitStatus?.changes ?? []}
            initialAction={agentActionRequest}
            resumeConversationId={agentResumeRequest?.conversationId ?? null}
            resumeRequested={agentResumeRequested}
            onApplyEdit={handleApplyAgentEdit}
            onClose={() => setAgentSidebarOpen(false)}
          />
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
        folderPath={folderPath}
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

      <WorkspaceOverviewModal
        open={workspaceOverviewOpen}
        roots={workspaceRoots}
        activeRootId={activeRootId}
        diagnostics={diagnostics}
        onClose={() => setWorkspaceOverviewOpen(false)}
        onSwitchRoot={(path) => {
          void handleSwitchWorkspaceRoot(path);
        }}
        onOpenTests={() => {
          setWorkspaceOverviewOpen(false);
          setTestExplorerOpen(true);
        }}
      />

      <TaskRunnerModal
        folderPath={folderPath}
        open={taskRunnerOpen}
        onClose={() => setTaskRunnerOpen(false)}
        onRunTask={(task) => void handleRunWorkspaceTask(task)}
      />

      <TestExplorerModal
        folderPath={folderPath}
        open={testExplorerOpen}
        onClose={() => setTestExplorerOpen(false)}
        onOutput={(message, level = "info") =>
          appendOutput("tests", message, level)
        }
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

      <LanguageToolsModal
        open={languageToolsOpen}
        folderPath={folderPath}
        activeFile={activePane?.activeFile ?? null}
        language={language}
        symbols={activeFileSymbols}
        onClose={() => setLanguageToolsOpen(false)}
        onGoToDefinition={() => runCommand(AXON_COMMANDS.GO_TO_DEFINITION)}
        onFindReferences={() => runCommand(AXON_COMMANDS.FIND_REFERENCES)}
        onRename={() => runCommand(AXON_COMMANDS.RENAME_SYMBOL)}
        onFormat={() => runCommand(AXON_COMMANDS.FORMAT_DOCUMENT)}
        onOpenOutline={() => {
          setLanguageToolsOpen(false);
          setFileOutlineOpen(true);
        }}
      />

      {settingsOpen && (
        <SettingsModal
          folderPath={folderPath}
          workspaceTrusted={workspaceTrusted}
          availableFonts={availableFonts}
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

      {workspaceTrustPromptPath && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#253044] bg-[#0e121b] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
            <div className="text-[14px] font-medium text-[#f4f7fb]">
              Trust this workspace?
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[#9aa4b8]">
              Axon can run project-aware features for{" "}
              <span className="font-medium text-[#dce4f0]">
                {getPathBasename(workspaceTrustPromptPath)}
              </span>
              , including language servers, tasks, terminals, and extensions.
              Only trust folders you recognize.
            </div>
            <div className="mt-3 truncate rounded-md border border-[#1d2432] bg-[#080b11] px-3 py-2 font-mono text-[10px] text-[#647086]">
              {workspaceTrustPromptPath}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTrusted(workspaceTrustPromptPath, false);
                  setWorkspaceTrustNonce((nonce) => nonce + 1);
                  setWorkspaceTrustPromptPath(null);
                  appendOutput("workspace", "Workspace marked untrusted.");
                }}
                className="h-8 cursor-pointer rounded-md border border-[#2a3346] px-3 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
              >
                Don&apos;t trust
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTrusted(workspaceTrustPromptPath, true);
                  setWorkspaceTrustNonce((nonce) => nonce + 1);
                  setWorkspaceTrustPromptPath(null);
                  appendOutput("workspace", "Workspace trusted.", "success");
                }}
                className="h-8 cursor-pointer rounded-md border border-[#80c8e0] bg-[#142a36] px-3 text-[12px] text-[#dff7ff] transition-colors hover:bg-[#183345]"
              >
                Trust workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && !splashVisible && <WorkspaceLoadingOverlay />}
      <CliToolInstallPrompt prompt={cliToolInstallPrompt} />
      {splashVisible && <SplashScreen leaving={splashLeaving} />}
    </div>
  );
}

export default App;
