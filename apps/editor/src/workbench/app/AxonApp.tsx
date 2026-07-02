import { useState, useCallback, useMemo, useRef } from "react";
import { AxonAppView } from "./AxonAppView";
import { writeFile, type FileNode } from "../../renderer/shared/lib/api";
import {
  clearLanguageServerDiagnosticsFromMonaco,
  collectEditorDiagnostics,
  type EditorDiagnostic,
} from "../../renderer/features/diagnostics/lib/diagnostics";
import { useAgentDiagnosticsExport } from "../../renderer/features/diagnostics/lib/useAgentDiagnosticsExport";
import {
  capDiagnostics,
  MAX_PROJECT_DIAGNOSTICS,
  type LspDiagnosticsByFile,
} from "../../renderer/features/diagnostics/lib/diagnosticCache";
import {
  createWelcomeLayout,
  createInitialLayout,
  openFileInPane,
  closeTabInPane,
} from "../../renderer/features/editor/lib/layoutManager";
import { type Layout } from "../../renderer/features/editor/lib/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../../shared/settings";
import { type AiActionId } from "../../shared/ai";
import {
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
  type GitStatusResult,
} from "../../shared/git";
import { type WorkspaceTask } from "../../shared/tasks";
import { type UpdateInfo, type UpdateInstallState } from "../../shared/updates";
import { type ExtensionState } from "../../shared/extensions";
import { type AgentResumeRequest } from "../../shared/app";
import { type EditorNavigationTarget } from "../../renderer/features/editor/lib/navigation";
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
import { toMonacoEdit } from "./lib/monacoEdit";
import { type WorkspaceRoot } from "../../renderer/shared/lib/workspaceRoots";
import "../../renderer/App.css";
import { useCliToolInstallPrompt } from "../../renderer/features/cli/useCliToolInstallPrompt";
import { useSpotify } from "../../renderer/features/spotify/lib/useSpotify";
import { detectLanguageServerLanguage, getModel } from "../../renderer/features/editor/lib/monacoModels";
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
  const [extensionState, setExtensionState] = useState<ExtensionState>(
    initialExtensionState,
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
  const {
    activeFileContent,
    activeFileSymbols,
    activePane,
    appThemeCssVariables,
    deletedFiles,
    diagnosticCounts,
    diagnostics,
    extensionThemes,
    gitChangeCount,
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
  const refreshExtensions = useCallback(async () => {
    try {
      const nextExtensionState = await window.axon.listExtensions(folderPath);
      setExtensionState(nextExtensionState);
    } catch (err) {
      console.error("failed to load extensions:", err);
      appendOutput("extensions", "Failed to load extensions.", "error");
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
          const versionBeforeFormat = model.getVersionId();
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath,
            languageId,
            content: model.getValue(),
            tabSize: modelOptions.tabSize,
            insertSpaces: modelOptions.insertSpaces,
          });
          const modelChangedDuringFormat =
            model.isDisposed() || versionBeforeFormat !== model.getVersionId();
          if (result.ok && result.edits.length > 0 && !modelChangedDuringFormat) {
            // Format-on-save works on the shared Monaco model before the disk
            // write so every split showing this file receives the same edits.
            // Formatting a detached string instead would let the saved text and
            // the visible editor drift until the next model refresh.
            model.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
          } else if (
            result.ok &&
            result.edits.length > 0 &&
            modelChangedDuringFormat
          ) {
            appendOutput(
              "lsp",
              "Skipped format-on-save because the file changed while formatting.",
              "warning",
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
      if (!folderPath) return false;
      await writeFile(filePath, model.getValue(), folderPath);
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
    const model = getModel(activeFile);
    if (model && !model.isDisposed()) {
      // Active file saves should go through the mounted SingleEditor when
      // possible because that component owns Monaco view state. Formatting from
      // the app shell can mutate the shared model without an editor instance to
      // restore scroll, which made Save jump to the bottom on large files.
      window.dispatchEvent(
        new CustomEvent("axon:saveFile", { detail: { path: activeFile } }),
      );
      return;
    }
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
    navigateDiagnostic,
    refreshGitStatus,
    refreshProjectDiagnostics,
    requireTrustedWorkspace,
    runEditorAction,
    settings,
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
    setFileOutlineOpen,
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
    allowSessionPersistenceRef,
    appendOutput,
    availableFonts,
    bottomPanelOpen,
    bottomPanelTab,
    extensionThemes,
    folderPath,
    folderRefreshRequestRef,
    folderRefreshTimerRef,
    handleDownloadUpdate,
    handleFolderChange,
    handleOpenNavigationTarget,
    handleSettingsSave,
    layout,
    lspDiagnosticsByFile,
    refreshExtensions,
    refreshGitStatus,
    refreshProjectDiagnostics,
    restoreStartedRef,
    runCommand,
    sessionReady,
    settings,
    settingsHydrated,
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
      cursorInfo,
      deletedFiles,
      diagnosticCounts,
      diagnostics,
      diffFilePath,
      diffOpen,
      extensionState,
      extensionThemes,
      extensionsOpen,
      fileOutlineOpen,
      folderPath,
      folderPickerOpen,
      gitChangeCount,
      gitHistoryEditor,
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
      themeTokens,
      tree,
      updateInfo,
      updateInstallState,
      updateModalOpen,
      workspaceOverviewOpen,
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
      setFileOutlineOpen,
      setFolderPickerOpen,
      setGitHistoryEditor,
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
