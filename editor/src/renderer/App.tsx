import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Sidebar, { addRecentFolder } from "./components/sidebar/index";
import EditorPane from "./components/EditorPane/index";
import StatusBar from "./components/StatusBar";
import Terminal from "./components/Terminal";
import CommandPalette, {
  type CommandPaletteCommand,
} from "./components/CommandPalette";
import WorkspaceSearchModal from "./components/WorkspaceSearchModal";
import {
  type BottomPanelTab,
  type OutputEntry,
  type OutputEntryLevel,
} from "./components/BottomPanel";
import DiffModal from "./components/DiffModal";
import EditorToolbar from "./components/EditorToolbar";
import SettingsModal from "./components/settings";
import SplashScreen from "./components/SplashScreen";
import AboutModal, { type AppInfo } from "./components/AboutModal";
import SourceControlModal from "./components/SourceControlModal";
import TaskRunnerModal from "./components/TaskRunnerModal";
import FileOutlineModal from "./components/FileOutlineModal";
import UpdateModal from "./components/UpdateModal";
import {
  getTree,
  createFile,
  writeFile,
  type FileNode,
  type WorkspaceSearchResult,
} from "./lib/api";
import {
  onEditorDiagnosticsChanged,
  type EditorDiagnostic,
} from "./lib/diagnostics";
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
} from "./lib/layoutManager";
import { type Layout, type SplitDirection } from "./lib/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../shared/commands";
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
  type LanguageServerLifecycleResult,
  type LanguageServerStatus,
} from "../shared/lsp";
import { type UpdateInfo } from "../shared/updates";
import { createThemeCssVariables, resolveThemeTokens } from "./lib/themeTokens";
import { type EditorNavigationTarget } from "./lib/navigation";
import { fontStack } from "./lib/fonts";
import { publicAsset } from "./lib/assets";
import {
  loadWorkspaceSession,
  sanitizeRestoredLayout,
  saveWorkspaceSession,
  type WorkspaceSession,
} from "./lib/workspaceSession";
import { getModel } from "./lib/monacoModels";
import { collectFileSymbols, type FileSymbol } from "./lib/fileSymbols";
import "./App.css";

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

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      importFont: () => Promise<CustomFont | null>;
      getSettings: (folderPath?: string | null) => Promise<AxonSettings>;
      updateSettings: (
        settings: AxonSettings,
        folderPath?: string | null,
      ) => Promise<AxonSettings>;
      ensureSettingsFile: (
        folderPath?: string | null,
        settings?: AxonSettings,
      ) => Promise<string>;
      getProjectDiagnostics: (folderPath: string) => Promise<EditorDiagnostic[]>;
      getLanguageServerStatus: (
        folderPath: string,
      ) => Promise<LanguageServerStatus[]>;
      startLanguageServers: (
        folderPath: string,
      ) => Promise<LanguageServerLifecycleResult>;
      stopLanguageServers: (
        folderPath: string,
      ) => Promise<LanguageServerLifecycleResult>;
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
      runGitAction: (
        folderPath: string,
        filePath: string,
        action: "stage" | "unstage" | "discard",
      ) => Promise<GitActionResult>;
      getAppInfo: () => Promise<AppInfo>;
      shouldRestoreSession: () => Promise<boolean>;
      checkForUpdates: () => Promise<UpdateInfo>;
      openUpdatePage: (releaseUrl?: string) => Promise<void>;
      copyText: (text: string) => Promise<void>;
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
      onMenuCommand: (callback: (command: AxonCommand) => void) => () => void;
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [settingsJsonPath, setSettingsJsonPath] = useState<string | null>(null);
  const [monacoDiagnostics, setMonacoDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [outputEntries, setOutputEntries] = useState<OutputEntry[]>([]);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const restoreStartedRef = useRef(false);
  const allowSessionPersistenceRef = useRef(true);

  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);
  const themeTokens = useMemo(() => resolveThemeTokens(settings), [settings]);
  const themeCssVariables = useMemo(
    () => createThemeCssVariables(themeTokens),
    [themeTokens],
  );
  const diagnostics = useMemo(
    () => [...projectDiagnostics, ...monacoDiagnostics],
    [monacoDiagnostics, projectDiagnostics],
  );
  const activeFileSymbols = useMemo<FileSymbol[]>(() => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return [];
    const model = getModel(activeFile);
    if (!model || model.isDisposed()) return [];
    return collectFileSymbols(model.getValue());
  }, [activePane?.activeFile, layout]);
  const gitChangeCount = gitStatus?.changes.length ?? 0;

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

  const handleOpenUpdatePage = useCallback(() => {
    void window.axon.openUpdatePage(updateInfo?.releaseUrl);
  }, [updateInfo?.releaseUrl]);

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
      const nextDiagnostics = await window.axon.getProjectDiagnostics(
        folderPath,
      );
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
      });
  }, []);

  useEffect(() => {
    // Update checks are informational for v1: Axon can tell the user that a
    // newer GitHub release exists, but it does not silently replace the app.
    // That matters while the builds are unsigned because macOS Gatekeeper and
    // Windows SmartScreen still need the user to approve downloaded installers.
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
  }, [appendOutput]);

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
    styleElement.textContent = settings.customFonts
      .map((font) => {
        const family = escapeCssString(font.family);
        const url = escapeCssString(font.url);
        return `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
      })
      .join("\n");
  }, [settings.customFonts]);

  useEffect(() => {
    return onEditorDiagnosticsChanged(setMonacoDiagnostics);
  }, []);

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
      window.setTimeout(() => {
        void refreshProjectDiagnostics();
        void refreshGitStatus({ silent: true });
      }, 600);
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
    const path = await window.axon.openFolder();
    if (!path) return;
    setLoading(true);
    try {
      const fileTree = await getTree(path);
      addRecentFolder(path);
      appendOutput("workspace", `Opening ${path}`);
      await handleFolderChange(path, fileTree);
      appendOutput("workspace", `Opened ${path}`, "success");
    } catch (err) {
      console.error("failed to load tree:", err);
      appendOutput("workspace", "Failed to open folder.", "error");
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
    void window.axon.getGitStatus(path).then(setGitStatus).catch(() => {
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
      setLayout((prev) => openFileInPane(prev, prev.activePaneId, target.path));
    },
    [],
  );

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
      const savedSettings =
        await window.axon.updateSettings(normalizedSettings, null);
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
      const settingsPath = await window.axon.ensureSettingsFile(
        null,
        settings,
      );
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
      length: 1,
    });
  };

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

  const handleSaveActiveFile = () => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;

    // The native menu lives in Electron's main process, while the actual save
    // logic belongs to the mounted editor for the active file. This event keeps
    // the behavior aligned with Cmd+S inside Monaco without moving editor model
    // ownership up into App.
    window.dispatchEvent(
      new CustomEvent("axon:saveFile", { detail: { path: activeFile } }),
    );
  };

  const saveFileFromModel = useCallback(
    async (filePath: string) => {
      const model = getModel(filePath);
      if (!model || model.isDisposed()) return false;

      await writeFile(filePath, model.getValue());
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
    [appendOutput],
  );

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
    (action: "definition" | "references") => {
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
        case AXON_COMMANDS.OPEN_SETTINGS_JSON:
          void handleOpenSettingsJson();
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
      layout.activePaneId,
      refreshProjectDiagnostics,
      refreshGitStatus,
      requestCloseTab,
      runEditorAction,
      settings,
      terminalOpen,
    ],
  );

  const paletteCommands = useMemo<CommandPaletteCommand[]>(
    () => [
      {
        id: AXON_COMMANDS.NEW_FILE,
        title: "New File",
        subtitle: folderPath
          ? "Create a file in the current workspace"
          : "Open a folder first",
        keywords: ["create", "untitled"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_FOLDER,
        title: "Open Folder",
        subtitle: "Choose another workspace folder",
        keywords: ["workspace", "project"],
      },
      {
        id: AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
        title: "Search Workspace",
        subtitle: folderPath
          ? "Search text across the current folder"
          : "Open a folder first",
        keywords: ["find", "grep"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_TASK_RUNNER,
        title: "Run Task",
        subtitle: folderPath
          ? "Run package, Go, or Cargo workspace tasks"
          : "Open a folder first",
        keywords: ["build", "test", "npm", "go", "cargo"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_FILE_OUTLINE,
        title: "File Outline",
        subtitle: activePane?.activeFile
          ? `${activeFileSymbols.length} symbols in active file`
          : "Select a file first",
        keywords: ["symbols", "outline", "functions", "classes"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.GO_TO_DEFINITION,
        title: "Go to Definition",
        subtitle: activePane?.activeFile
          ? "Jump to the symbol definition Monaco can resolve"
          : "Select a file first",
        keywords: ["definition", "symbol", "jump"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.FIND_REFERENCES,
        title: "Find References",
        subtitle: activePane?.activeFile
          ? "Show usages for the current symbol"
          : "Select a file first",
        keywords: ["references", "usages", "symbol"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
        title: "Show Problems",
        subtitle: `${diagnostics.length} diagnostics`,
        keywords: ["diagnostics", "errors", "warnings"],
      },
      {
        id: AXON_COMMANDS.REFRESH_DIAGNOSTICS,
        title: "Refresh Diagnostics",
        subtitle: folderPath
          ? "Run project diagnostics for the current workspace"
          : "Open a folder first",
        keywords: ["diagnostics", "check", "errors", "lint"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.OPEN_OUTPUT_PANEL,
        title: "Show Output",
        subtitle: "Open logs, task output, and future AI output",
        keywords: ["logs", "panel"],
      },
      {
        id: AXON_COMMANDS.CLEAR_OUTPUT,
        title: "Clear Output",
        subtitle: "Clear the Output panel log",
        keywords: ["logs", "output", "reset"],
      },
      {
        id: AXON_COMMANDS.TOGGLE_TERMINAL,
        title: terminalOpen ? "Hide Terminal" : "Show Terminal",
        subtitle: "Toggle the terminal panel",
        keywords: ["shell", "console"],
      },
      {
        id: AXON_COMMANDS.NEW_TERMINAL,
        title: "New Terminal",
        subtitle: "Create a terminal tab",
        keywords: ["shell", "pty"],
      },
      {
        id: AXON_COMMANDS.OPEN_DIFF_VIEW,
        title: "Compare Active File",
        subtitle: activePane?.activeFile
          ? "Open the active file diff view"
          : "Select a file first",
        keywords: ["diff", "changes"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_SOURCE_CONTROL,
        title: "Source Control",
        subtitle: folderPath
          ? `${gitChangeCount} changed file${gitChangeCount === 1 ? "" : "s"}`
          : "Open a folder first",
        keywords: ["git", "changes", "diff", "source"],
        disabled: !folderPath,
      },
      {
        id: AXON_COMMANDS.SAVE,
        title: "Save Active File",
        subtitle: activePane?.activeFile
          ? "Save the current tab"
          : "No active file",
        keywords: ["write"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.CLOSE_TAB,
        title: "Close Active Tab",
        subtitle: activePane?.activeFile
          ? "Close the current tab"
          : "No active file",
        keywords: ["remove"],
        disabled: !activePane?.activeFile,
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS,
        title: "Open Settings",
        subtitle: "Edit settings from the UI",
        keywords: ["preferences", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.OPEN_SETTINGS_JSON,
        title: "Open Settings JSON",
        subtitle: "Edit settings JSON directly",
        keywords: ["preferences", "config", "theme", "font"],
      },
      {
        id: AXON_COMMANDS.TOGGLE_ZEN_MODE,
        title: zenMode ? "Exit Zen Mode" : "Enter Zen Mode",
        subtitle: "Toggle focused editor layout",
        keywords: ["focus", "fullscreen"],
      },
      {
        id: AXON_COMMANDS.ABOUT,
        title: "About Axon",
        subtitle: "Show app and runtime information",
        keywords: ["version"],
      },
    ],
    [
      activePane?.activeFile,
      activeFileSymbols.length,
      diagnostics.length,
      folderPath,
      gitChangeCount,
      terminalOpen,
      zenMode,
    ],
  );

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
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE);
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
        ...themeCssVariables,
        background: "var(--axon-background)",
        fontFamily: fontStack(
          settings.editor.uiFontFamily,
          "system-ui, sans-serif",
        ),
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
            onSplitFile={(filePath) => handleSplit("right", filePath)}
            onOpenInTerminal={handleOpenPathInTerminal}
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
          />
        )}

        <div className="relative flex flex-col flex-1 overflow-hidden">
          {!zenMode && (
            <div
              className="flex items-center border-b pr-1"
              style={{
                background: "var(--axon-toolbar-background)",
                borderColor: "var(--axon-panel-border)",
              }}
            >
              <div className="flex-1 overflow-hidden">
                {activePane && (
                  <TabBarForActivePane
                    layout={layout}
                    onSelect={(f) =>
                      setLayout((prev) =>
                        setActivePaneFile(prev, prev.activePaneId, f),
                      )
                    }
                    onClose={(f) =>
                      void requestCloseTab(layout.activePaneId, f)
                    }
                    onReorder={(tabs) =>
                      setLayout((prev) =>
                        reorderTabsInPane(prev, prev.activePaneId, tabs),
                      )
                    }
                  />
                )}
              </div>
              <EditorToolbar
                onNewFile={() => runCommand(AXON_COMMANDS.NEW_FILE)}
                onOpenFile={() => runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE)}
                onSearch={() => runCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH)}
                onDiff={() => runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW)}
                onNewTerminal={() => runCommand(AXON_COMMANDS.NEW_TERMINAL)}
                onSplit={handleSplit}
                onZenMode={() => runCommand(AXON_COMMANDS.TOGGLE_ZEN_MODE)}
                onSettings={() => runCommand(AXON_COMMANDS.OPEN_SETTINGS)}
                updateInfo={updateInfo}
                onOpenUpdate={() => setUpdateModalOpen(true)}
                isZenMode={zenMode}
              />
            </div>
          )}

          <EditorPane
            layout={layout}
            folderPath={folderPath}
            onActivatePane={(id) =>
              setLayout((prev) => ({ ...prev, activePaneId: id }))
            }
            onSelectFile={(paneId, f) =>
              setLayout((prev) => openFileInPane(prev, paneId, f))
            }
            onCloseTab={(paneId, f) =>
              void requestCloseTab(paneId, f)
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
            onClosePane={(paneId) => setLayout((prev) => closePane(prev, paneId))}
            onOpenTabInTerminal={handleOpenTabInTerminal}
            editorSettings={settings.editor}
            themeTokens={themeTokens}
            navigationTarget={navigationTarget}
            gitChanges={gitStatus?.changes ?? []}
            handleOpenFolder={handleOpenFolder}
            handleNewFile={handleNewFile}
            handleFolderChange={handleFolderChange}
          />

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
      </div>

      {!zenMode && (
        <StatusBar
          activeFile={activePane?.activeFile ?? null}
          language={language}
          cursor={cursorInfo}
          folderName={folderPath ? (folderPath.split("/").pop() ?? null) : null}
          sidebarCollapsed={sidebarCollapsed}
          terminalOpen={terminalOpen}
          bottomPanelOpen={bottomPanelOpen}
          bottomPanelTab={bottomPanelTab}
          problemCount={diagnostics.length}
          gitBranch={gitStatus?.branch ?? null}
          gitChangeCount={gitChangeCount}
          themeTokens={themeTokens}
          onToggleSidebar={() => setSidebarCollapsed((p) => !p)}
          onToggleTerminal={() => runCommand(AXON_COMMANDS.TOGGLE_TERMINAL)}
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
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onPreview={handleSettingsPreview}
          onSave={handleSettingsSave}
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
          onClose={() => setUpdateModalOpen(false)}
          onOpenUpdatePage={handleOpenUpdatePage}
        />
      )}

      {diffOpen && (diffFilePath || activePane?.activeFile) && (
        <DiffModal
          filePath={diffFilePath ?? activePane?.activeFile ?? ""}
          folderPath={folderPath}
          editorSettings={settings.editor}
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
        onOutput={(message, level = "info") =>
          appendOutput("git", message, level)
        }
      />

      {loading && !splashVisible && <WorkspaceLoadingOverlay />}
      {splashVisible && <SplashScreen leaving={splashLeaving} />}
    </div>
  );
}

function WorkspaceLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#080a10]/72 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[#222838] bg-[#10131b]/92 px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
        <img
          src={publicAsset("axon.png")}
          alt="Axon"
          className="h-12 w-12 object-contain opacity-70"
        />
        <div className="flex flex-col items-center gap-1">
          <div className="text-[12px] font-medium text-[#c8d0e0]">
            Preparing workspace
          </div>
          <div className="text-[11px] text-[#586478]">
            Reading files, settings, Git state, and diagnostics.
          </div>
        </div>
        <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-[#1a2030]">
          <div className="axon-workspace-loading__bar h-full w-16 rounded-full bg-[#80c8e0]" />
        </div>
      </div>
    </div>
  );
}

// TabBarForActivePane is a thin wrapper, the toolbar area only shows
// the active pane tabs. Each pane's full tab bar is inside PaneInstance.
function TabBarForActivePane({
  layout,
  onSelect,
  onClose,
  onReorder,
}: {
  layout: Layout;
  onSelect: (f: string) => void;
  onClose: (f: string) => void;
  onReorder: (tabs: string[]) => void;
}) {
  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);
  if (!activePane) return null;
  return null;
}

export default App;
