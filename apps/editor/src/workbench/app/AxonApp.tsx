import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AxonAppView } from "./AxonAppView";
import { writeFile, type FileNode } from "../../renderer/shared/lib/api";
import {
  clearLanguageServerDiagnosticsFromMonaco,
  collectEditorDiagnostics,
  type EditorDiagnostic,
} from "@axon-builtin-problems/lib/diagnostics";
import { AXON_PROBLEMS_TAB_PATH } from "@axon-builtin-problems/lib/problemsTab";
import { useAgentDiagnosticsExport } from "@axon-builtin-problems/lib/useAgentDiagnosticsExport";
import {
  capDiagnostics,
  MAX_PROJECT_DIAGNOSTICS,
  type LspDiagnosticsByFile,
} from "@axon-builtin-problems/lib/diagnosticCache";
import {
  createWelcomeLayout,
  createInitialLayout,
  openFileInPane,
  closeTabInPane,
} from "../../renderer/features/editor/lib/layout/layoutManager";
import { type Layout } from "../../renderer/features/editor/lib/layout/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../../shared/settings";
import { type AiActionId } from "../../shared/ai";
import { type GitStatusResult } from "../../shared/git";
import { type WorkspaceTask } from "../../shared/tasks";
import { type UpdateInfo, type UpdateInstallState } from "../../shared/updates";
import { type ExtensionState } from "../../shared/extensions";
import {
  type AgentResumeRequest,
  type FolderPickerIntent,
} from "../../shared/app";
import { type EditorNavigationTarget } from "../../renderer/features/editor/lib/layout/navigation";
import {
  type BottomPanelTab,
  type OutputEntry,
  type OutputEntryLevel,
} from "../../platform/panel/bottomPanel";
import { buildAppPaletteCommands } from "./lib/appCommandPalette";
import { useAppDerivedState } from "./lib/useAppDerivedState";
import { useAxonAppEffects } from "./lib/useAxonAppEffects";
import { useAppCommandRunner } from "./lib/useAppCommandRunner";
import { useWorkspaceHandlers } from "./lib/useWorkspaceHandlers";
import { useEditorSurfaceHandlers } from "./lib/useEditorSurfaceHandlers";
import { useSaveFileAs } from "./lib/useSaveFileAs";
import { useGitStatusRefresh } from "./lib/useGitStatusRefresh";
import { useAutoSave } from "./lib/useAutoSave";
import { useSaveFileFromModel } from "./lib/useSaveFileFromModel";
import { type WorkspaceRoot } from "../../renderer/shared/lib/workspaceRoots";
import { dispatchEditorSave } from "../../renderer/features/editor/lib/buffer/editorSave";
import {
  AXON_OPEN_GIT_COMMIT_DIFF_EVENT,
  releaseGitCommitDiffTab,
  type OpenGitCommitDiffDetail,
} from "@axon-builtin-git/git/lib/gitGraphTab";
import "../../renderer/App.css";
import { useCliToolInstallPrompt } from "../../renderer/features/cli/useCliToolInstallPrompt";
import { useLanguageToolInstallPrompt } from "../../renderer/features/languageTools/useLanguageToolInstallPrompt";
import { useManagedLanguageToolInstallations } from "../../renderer/features/languageTools/useManagedLanguageToolInstallations";
import { useSpotify } from "@axon-builtin-spotify/lib/useSpotify";
import { useWindowFullScreen } from "./lib/useWindowFullScreen";
import {
  hasSeenAxonOnboarding,
  markAxonOnboardingSeen,
} from "../../renderer/features/onboarding/lib/welcomeTab";
interface AppProps {
  initialExtensionState: ExtensionState;
}
function formatOutputTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
export default function App({ initialExtensionState }: AppProps) {
  const shouldShowOnboardingRef = useRef(!hasSeenAxonOnboarding());
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [workspaceRoots, setWorkspaceRoots] = useState<WorkspaceRoot[]>([]);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => {
    if (!shouldShowOnboardingRef.current) {
      return createInitialLayout();
    }
    markAxonOnboardingSeen();
    return createWelcomeLayout();
  });
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
  const [extensionViewOpenId, setExtensionViewOpenId] = useState<string | null>(
    null,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [folderPickerIntent, setFolderPickerIntent] =
    useState<FolderPickerIntent | null>(null);
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
  const [extensionState, setExtensionState] = useState<ExtensionState>(
    initialExtensionState,
  );
  useEffect(() => {
    const handleExtensionState = (event: Event) => {
      setExtensionState((event as CustomEvent<ExtensionState>).detail);
    };
    window.addEventListener("axon:extensionState", handleExtensionState);
    return () => window.removeEventListener("axon:extensionState", handleExtensionState);
  }, []);
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
  useEffect(() => {
    const openCommitDiff = (event: Event) => {
      const { tabPath } = (event as CustomEvent<OpenGitCommitDiffDetail>)
        .detail;
      if (!tabPath) return;
      setLayout((current) =>
        openFileInPane(current, current.activePaneId, tabPath),
      );
    };
    window.addEventListener(AXON_OPEN_GIT_COMMIT_DIFF_EVENT, openCommitDiff);
    return () =>
      window.removeEventListener(
        AXON_OPEN_GIT_COMMIT_DIFF_EVENT,
        openCommitDiff,
      );
  }, []);
  const platform = window.axon.platform;
  const windowFullScreen = useWindowFullScreen();
  const [sessionReady, setSessionReady] = useState(false);
  const restoreStartedRef = useRef(false);
  const themeFallbackRepairAttemptedRef = useRef(false);
  const settingsSaveRequestRef = useRef(0);
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
  const languageToolInstallations = useManagedLanguageToolInstallations();
  const [workspaceTrustNonce, setWorkspaceTrustNonce] = useState(0);
  const sidebarSpotifyVisible = sidebarView === "spotify" && !sidebarCollapsed;
  const [spotifyState, spotifyActions] = useSpotify(sidebarSpotifyVisible);
  const {
    activeFileContent,
    activeFileSymbols,
    activePane,
    activeThemeId,
    appThemeCssVariables,
    deletedFiles,
    diagnosticCounts,
    diagnostics,
    extensionThemes,
    gitChangeCount,
    themeSyntax,
    themeTokens,
    workspaceTrusted,
  } = useAppDerivedState({
    extensionState,
    folderPath,
    gitStatus,
    layout,
    lspDiagnosticsByFile,
    monacoDiagnostics,
    projectDiagnostics,
    settings,
    workspaceTrustNonce,
  });
  const languageToolInstallPrompt = useLanguageToolInstallPrompt({
    activeFile: activePane?.activeFile ?? null,
    folderPath,
    workspaceTrusted,
  });
  const handleOpenNavigationTarget = useCallback(
    (target: Omit<EditorNavigationTarget, "id">) => {
      // Navigation is intentionally owned by the app shell even though the
      // visible editors live in panes. Opening the file and storing the reveal
      // target together prevents search, diagnostics, breadcrumbs, and command
      // palette jumps from racing Monaco before the selected tab has mounted.
      const nextTarget = {
        ...target,
        id: Date.now(),
      };
      setNavigationTarget(nextTarget);
      setLayout((prev) => {
        const existingPane = prev.panes.find((pane) =>
          pane.openTabs.includes(target.path),
        );
        if (existingPane) {
          return openFileInPane(prev, existingPane.id, target.path);
        }
        return openFileInPane(prev, prev.activePaneId, target.path);
      });
    },
    [],
  );
  useAgentDiagnosticsExport({ folderPath, diagnostics });
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
  const refreshGitStatus = useGitStatusRefresh({
    appendOutput,
    folderPath,
    setGitStatus,
  });
  const refreshProjectDiagnostics = useCallback(async () => {
    setProjectDiagnostics([]);
    setLspDiagnosticsByFile({});
    clearLanguageServerDiagnosticsFromMonaco();
    setMonacoDiagnostics(collectEditorDiagnostics());
    if (!folderPath) {
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
  const {
    handleFileSelect,
    handleFolderChange,
    handleNewFile,
    handleOpenFolder,
    handleRefresh,
    handleSwitchWorkspaceRoot,
  } = useWorkspaceHandlers({
    allowSessionPersistenceRef,
    appendOutput,
    bottomPanelOpen,
    bottomPanelTab,
    folderPath,
    refreshGitStatus,
    setActiveRootId,
    setBottomPanelOpen,
    setBottomPanelTab,
    setFolderPath,
    setGitStatus,
    setLayout,
    setLoading,
    setSettings,
    setSidebarCollapsed,
    setSidebarWidth,
    setTerminalCreateWorkingDirectory,
    setTerminalOpen,
    setTree,
    setWorkspaceRoots,
    setWorkspaceTrustPromptPath,
    sidebarCollapsed,
    sidebarWidth,
    terminalOpen,
    workspaceRoots,
  });
  const {
    handleNewTerminal,
    handleOpenHtmlPreview,
    handleOpenPathInTerminal,
    handleOpenTabInTerminal,
    handleSplit,
    handleWorkspaceSearchResult,
  } = useEditorSurfaceHandlers({
    appendOutput,
    folderPath,
    handleOpenNavigationTarget,
    requireTrustedWorkspace,
    setBottomPanelOpen,
    setLayout,
    setTerminalCreateNonce,
    setTerminalCreateWorkingDirectory,
    setTerminalOpen,
  });
  const handleApplyAgentEdit = useCallback(
    async (filePath: string, content: string) => {
      if (!folderPath) return;
      await writeFile(filePath, content, folderPath);
      handleFileSelect(filePath);
      await handleRefresh();
      appendOutput("ai", `Applied Axon edit to ${filePath}`, "success");
    },
    [appendOutput, folderPath],
  );
  const handleSettingsSave = useCallback(async (
    nextSettings: AxonSettings,
    options: { announce?: boolean } = { announce: true },
  ) => {
    const normalizedSettings = normalizeSettings(nextSettings);
    const requestId = ++settingsSaveRequestRef.current;
    setSettings(normalizedSettings);
    try {
      const savedSettings = await window.axon.updateSettings(
        normalizedSettings,
        null,
      );
      if (requestId === settingsSaveRequestRef.current) {
        setSettings(normalizeSettings(savedSettings));
      }
      if (options.announce !== false) {
        appendOutput("settings", "Saved settings.", "success");
      }
      return true;
    } catch (err) {
      console.error("failed to save settings:", err);
      appendOutput("settings", "Failed to save settings.", "error");
      return false;
    }
  }, [appendOutput]);
  useEffect(() => {
    // Rendering with a fallback is enough to survive this launch, but leaving
    // the unavailable ID on disk would make every future launch repeat the
    // same recovery path. Once the registry has loaded at least one theme, I
    // silently persist the effective ID so the boot shell, renderer, and
    // settings picker all begin the next session from the same valid value.
    if (
      !settingsHydrated ||
      extensionThemes.length === 0 ||
      themeFallbackRepairAttemptedRef.current
    ) {
      return;
    }
    themeFallbackRepairAttemptedRef.current = true;

    if (settings.editor.themeId === activeThemeId) return;

    void handleSettingsSave(
      {
        ...settings,
        editor: {
          ...settings.editor,
          themeId: activeThemeId,
        },
      },
      { announce: false },
    );
  }, [
    activeThemeId,
    extensionThemes.length,
    handleSettingsSave,
    settings,
    settingsHydrated,
  ]);
  const handleSettingsPreview = useCallback((nextSettings: AxonSettings) => {
    // SettingsModal owns the editable draft, but App owns the live theme and
    // editor options. Previewing through this callback keeps the shell, Monaco,
    // terminal, and panels in sync with the current draft without writing every
    // slider movement or color keystroke to the app settings file.
    settingsSaveRequestRef.current += 1;
    setSettings(normalizeSettings(nextSettings));
  }, []);
  useEffect(() => {
    void window.axon.setAutoSaveMenuChecked(settings.editor.autoSave);
  }, [settings.editor.autoSave]);
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
  const openProblemsTab = useCallback(() => {
    setBottomPanelOpen(false);
    setLayout((prev) =>
      openFileInPane(prev, prev.activePaneId, AXON_PROBLEMS_TAB_PATH),
    );
  }, []);
  const navigateDiagnostic = useCallback(
    (direction: 1 | -1) => {
      if (diagnostics.length === 0) {
        openProblemsTab();
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
    },
    [
      activePane?.activeFile,
      cursorInfo.col,
      cursorInfo.line,
      diagnostics,
      openProblemsTab,
    ],
  );
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
  const saveFileFromModel = useSaveFileFromModel({
    appendOutput,
    folderPath,
    formatOnSave: settings.editor.formatOnSave,
    setLayout,
    workspaceTrusted,
  });
  useAutoSave({
    enabled: settings.editor.autoSave,
    panes: layout.panes,
    saveDetachedFile: (filePath) =>
      saveFileFromModel(filePath, { announce: false }),
    onError: (message) => appendOutput("file", message, "error"),
  });
  const handleSaveActiveFile = useCallback(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;
    // Active files prefer the mounted editor because it owns Monaco view state
    // and can restore the viewport after formatting. A cached model may outlive
    // its editor, however, so the cancelable event must be claimed explicitly;
    // otherwise preview tabs and remounted panes would make Save do nothing.
    if (dispatchEditorSave(activeFile)) return;

    void saveFileFromModel(activeFile).then((saved) => {
      if (!saved) {
        appendOutput("file", "Could not find editor buffer to save.", "error");
      }
    });
  }, [activePane?.activeFile, appendOutput, saveFileFromModel]);
  const handleSaveActiveFileAs = useSaveFileAs({
    activeFile: activePane?.activeFile ?? null,
    appendOutput,
    handleRefresh,
    setLayout,
  });
  const handleToggleAutoSave = useCallback(() => {
    void handleSettingsSave(
      {
        ...settings,
        editor: {
          ...settings.editor,
          autoSave: !settings.editor.autoSave,
        },
      },
      { announce: false },
    );
  }, [handleSettingsSave, settings]);
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
      setLayout((prev) => {
        const next = closeTabInPane(prev, paneId, filePath);
        const tabStillOpen = next.panes.some((candidate) =>
          candidate.openTabs.includes(filePath),
        );
        if (!tabStillOpen) releaseGitCommitDiffTab(filePath);
        return next;
      });
    },
    [appendOutput, layout.panes, saveFileFromModel],
  );
  const handleCloseActiveTab = () => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;
    void requestCloseTab(layout.activePaneId, activeFile);
  };
  const runEditorAction = useCallback(
    (
      action:
        | "definition"
        | "references"
        | "rename"
        | "format"
        | "snapshot"
        | "inspect-token",
    ) => {
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
  const runCommand = useAppCommandRunner({
    activeFilePath: activePane?.activeFile ?? null,
    appendOutput,
    clearOutputEntries,
    handleCloseActiveTab,
    handleNewFile,
    handleNewTerminal,
    handleOpenFolder,
    handleOpenHtmlPreview,
    handleOpenSettingsJson,
    handleSaveActiveFile,
    handleSaveActiveFileAs,
    handleToggleAutoSave,
    navigateDiagnostic,
    openProblemsTab,
    refreshGitStatus,
    refreshProjectDiagnostics,
    requireTrustedWorkspace,
    runEditorAction,
    folderPath,
    settings,
    setExtensionState,
    terminalOpen,
    updateAvailable: updateInfo?.updateAvailable,
    setAboutOpen,
    setAgentActionRequest,
    setAgentSidebarOpen,
    setBottomPanelOpen,
    setBottomPanelTab,
    setDiffFilePath,
    setDiffOpen,
    setExtensionsOpen,
    setExtensionViewOpenId,
    setFileOutlineOpen,
    setFolderPickerIntent,
    setLanguageToolsOpen,
    setPaletteOpen,
    setSettingsOpen,
    setSidebarCollapsed,
    setSidebarView,
    setSourceControlOpen,
    setTaskRunnerOpen,
    setTerminalOpen,
    setTestExplorerOpen,
    setUpdateModalOpen,
    setWorkspaceOverviewOpen,
    setWorkspaceSearchOpen,
    setZenMode,
  });
  const paletteCommands = useMemo(
    () =>
      buildAppPaletteCommands({
        activeFilePath: activePane?.activeFile ?? null,
        activeFileSymbolCount: activeFileSymbols.length,
        diagnosticsCount: diagnostics.length,
        extensionState,
        folderPath,
        gitChangeCount,
        language,
        settings,
        terminalOpen,
        updateInfo,
        workspaceRootCount: workspaceRoots.length,
        workspaceTrusted,
        zenMode,
      }),
    [
      activePane?.activeFile,
      activeFileSymbols.length,
      diagnostics.length,
      extensionState,
      folderPath,
      gitChangeCount,
      language,
      settings,
      terminalOpen,
      updateInfo,
      workspaceRoots.length,
      workspaceTrusted,
      zenMode,
    ],
  );
  useAxonAppEffects({
    activeLanguageServerStartRef,
    activePane,
    activeRootId,
    activeThemeId,
    allowSessionPersistenceRef,
    appendOutput,
    availableFonts,
    bottomPanelOpen,
    bottomPanelTab,
    extensionThemes,
    folderPath,
    gitStatus,
    folderRefreshRequestRef,
    folderRefreshTimerRef,
    handleDownloadUpdate,
    handleFolderChange,
    handleOpenNavigationTarget,
    handleSettingsSave,
    layout,
    lspDiagnosticsByFile,
    refreshGitStatus,
    refreshProjectDiagnostics,
    restoreStartedRef,
    runCommand,
    sessionReady,
    settings,
    settingsJsonPath,
    sidebarCollapsed,
    sidebarWidth,
    setAgentResumeRequest,
    setAgentResumeRequested,
    setAgentSidebarOpen,
    setAvailableFonts,
    setExtensionsOpen,
    setLoading,
    setLspDiagnosticsByFile,
    setMonacoDiagnostics,
    setProjectDiagnostics,
    setSessionReady,
    setSettings,
    setSettingsHydrated,
    setTaskRunnerOpen,
    setTerminalOpen,
    setTree,
    setUpdateInfo,
    setUpdateInstallState,
    setWorkspaceRoots,
    setZenMode,
    terminalOpen,
    themeTokens,
    updateAutoDownloadVersionRef,
    updateInfo,
    updateInstallState,
    workspaceRoots,
    workspaceTrusted,
    workspaceTrustNonce,
    zenMode,
  });
  return (
    <AxonAppView
      {...{
        activeFileContent,
        activeFileSymbols,
        activePane,
        activeRootId,
        agentActionRequest,
        agentResumeRequest,
        agentResumeRequested,
        agentSidebarOpen,
        appThemeCssVariables,
        availableFonts,
        bottomPanelOpen,
        bottomPanelTab,
        cliToolInstallPrompt,
        languageToolInstallPrompt,
        languageToolInstallations,
        cursorInfo,
        deletedFiles,
        diagnosticCounts,
        diagnostics,
        diffFilePath,
        diffOpen,
        extensionState,
        extensionThemes,
        extensionViewOpenId,
        extensionsOpen,
        fileOutlineOpen,
        folderPath,
        folderPickerIntent,
        gitChangeCount,
        gitStatus,
        handleApplyAgentEdit,
        handleDownloadUpdate,
        handleFileSelect,
        handleFolderChange,
        handleNewFile,
        handleOpenDiagnostic,
        handleOpenFolder,
        handleOpenHtmlPreview,
        handleOpenNavigationTarget,
        handleOpenPathInTerminal,
        handleOpenTabInTerminal,
        handleWorkspaceSearchResult,
        handleOpenUpdatePage,
        handleRefresh,
        handleInstallUpdate,
        handleRunWorkspaceTask,
        handleSettingsPreview,
        handleSettingsSave,
        handleSplit,
        handleSwitchWorkspaceRoot,
        language,
        languageToolsOpen,
        layout,
        loading,
        navigationTarget,
        outputEntries,
        paletteCommands,
        paletteOpen,
        platform,
        requestCloseTab,
        runCommand,
        settings,
        settingsHydrated,
        settingsOpen,
        sidebarCollapsed,
        sidebarView,
        sidebarWidth,
        sourceControlOpen,
        spotifyActions,
        spotifyPlayerOpen,
        spotifyState,
        taskRunnerOpen,
        terminalCreateNonce,
        terminalCreateWorkingDirectory,
        terminalOpen,
        testExplorerOpen,
        themeSyntax,
        themeTokens,
        tree,
        updateInfo,
        updateInstallState,
        updateModalOpen,
        workspaceOverviewOpen,
        windowFullScreen,
        workspaceRoots,
        workspaceSearchOpen,
        workspaceTrusted,
        workspaceTrustPromptPath,
        zenMode,
        setAboutOpen,
        setAgentSidebarOpen,
        setBottomPanelOpen,
        setBottomPanelTab,
        setDiffFilePath,
        setDiffOpen,
        setExtensionsOpen,
        setExtensionState,
        setExtensionViewOpenId,
        setFileOutlineOpen,
        setFolderPickerIntent,
        setLanguage,
        setLanguageToolsOpen,
        setLayout,
        setPaletteOpen,
        setSettingsOpen,
        setSidebarCollapsed,
        setSidebarView,
        setSidebarWidth,
        setSourceControlOpen,
        setSpotifyPlayerOpen,
        setTaskRunnerOpen,
        setTerminalOpen,
        setTestExplorerOpen,
        setUpdateModalOpen,
        setWorkspaceOverviewOpen,
        setWorkspaceSearchOpen,
        setWorkspaceTrustNonce,
        setWorkspaceTrustPromptPath,
        setZenMode,
        setCursorInfo,
        appendOutput,
        aboutOpen,
        refreshGitStatus,
      }}
    />
  );
}
