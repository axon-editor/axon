import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar, { addRecentFolder } from "./components/sidebar/index";
import EditorPane from "./components/EditorPane/index";
import StatusBar from "./components/StatusBar";
import Terminal from "./components/Terminal";
import CommandPalette, {
  type CommandPaletteCommand,
} from "./components/CommandPalette";
import WorkspaceSearchModal from "./components/WorkspaceSearchModal";
import { type BottomPanelTab } from "./components/BottomPanel";
import DiffModal from "./components/DiffModal";
import EditorToolbar from "./components/EditorToolbar";
import SettingsModal from "./components/SettingsModal";
import SplashScreen from "./components/SplashScreen";
import AboutModal, { type AppInfo } from "./components/AboutModal";
import {
  getTree,
  createFile,
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
} from "../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../shared/commands";
import { createThemeCssVariables, resolveThemeTokens } from "./lib/themeTokens";
import { type EditorNavigationTarget } from "./lib/navigation";
import "./App.css";

function fontStack(primaryFont: string, fallback: string) {
  return `"${primaryFont}", ${fallback}`;
}

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
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
      getAppInfo: () => Promise<AppInfo>;
      copyText: (text: string) => Promise<void>;
      watchFile: (path: string) => Promise<void>;
      unwatchFile: () => Promise<void>;
      watchFolder: (path: string) => Promise<void>;
      unwatchFolder: () => Promise<void>;
      onFileChanged: (
        callback: (data: { path: string; content: string }) => void,
      ) => () => void;
      onFolderChanged: (callback: () => void) => () => void;
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
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] =
    useState<BottomPanelTab>("problems");
  const [diffOpen, setDiffOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [settingsJsonPath, setSettingsJsonPath] = useState<string | null>(null);
  const [monacoDiagnostics, setMonacoDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [projectDiagnostics, setProjectDiagnostics] = useState<
    EditorDiagnostic[]
  >([]);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);

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

  const refreshProjectDiagnostics = useCallback(async () => {
    if (!folderPath) {
      setProjectDiagnostics([]);
      return;
    }

    try {
      const nextDiagnostics = await window.axon.getProjectDiagnostics(
        folderPath,
      );
      setProjectDiagnostics(nextDiagnostics);
    } catch (err) {
      console.error("failed to load project diagnostics:", err);
      setProjectDiagnostics([]);
    }
  }, [folderPath]);

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
      // same validation and default-filling logic protects both the modal and
      // axon.json paths.
      window.axon
        .getSettings(folderPath)
        .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
        .catch((err) => {
          console.error("failed to reload settings json:", err);
        });
      void refreshProjectDiagnostics();
    };

    window.addEventListener("axon:fileSaved", handleFileSaved);
    return () => window.removeEventListener("axon:fileSaved", handleFileSaved);
  }, [folderPath, refreshProjectDiagnostics, settingsJsonPath]);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged(() => {
      if (!folderPath) return;
      getTree(folderPath).then(setTree).catch(console.error);
      window.setTimeout(() => {
        void refreshProjectDiagnostics();
      }, 600);
    });
    return cleanup;
  }, [folderPath, refreshProjectDiagnostics]);

  const handleOpenFolder = async () => {
    const path = await window.axon.openFolder();
    if (!path) return;
    setLoading(true);
    try {
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await handleFolderChange(path, fileTree);
    } catch (err) {
      console.error("failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderChange = async (path: string, fileTree: FileNode) => {
    setFolderPath(path);
    setTree(fileTree);
    setLayout(createInitialLayout());

    // Opening another project should reset project-scoped UI. The editor
    // layout already resets above; the terminal panel is also hidden so old
    // shell sessions do not appear to belong to the newly selected folder.
    setTerminalOpen(false);
    setTerminalCreateWorkingDirectory(null);
    setSettingsJsonPath(`${path}/axon.json`);

    try {
      const workspaceSettings = await window.axon.getSettings(path);
      setSettings(normalizeSettings(workspaceSettings));
    } catch (err) {
      console.error("failed to load workspace settings:", err);
    }

    await window.axon.unwatchFolder();
    await window.axon.watchFolder(path);
    void window.axon
      .getProjectDiagnostics(path)
      .then(setProjectDiagnostics)
      .catch((err) => {
        console.error("failed to load project diagnostics:", err);
        setProjectDiagnostics([]);
      });
  };

  const handleRefresh = async () => {
    if (!folderPath) return;
    try {
      const fileTree = await getTree(folderPath);
      setTree(fileTree);
    } catch (err) {
      console.error("failed to refresh tree:", err);
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
  };

  const handleSettingsSave = async (nextSettings: AxonSettings) => {
    const normalizedSettings = normalizeSettings(nextSettings);
    setSettings(normalizedSettings);

    try {
      const savedSettings =
        await window.axon.updateSettings(normalizedSettings, folderPath);
      setSettings(normalizeSettings(savedSettings));
    } catch (err) {
      console.error("failed to save settings:", err);
    }
  };

  const handleOpenSettingsJson = async () => {
    try {
      const settingsPath = await window.axon.ensureSettingsFile(
        folderPath,
        settings,
      );
      setSettingsJsonPath(settingsPath);
      if (folderPath) await handleRefresh();
      handleFileSelect(settingsPath);
    } catch (err) {
      console.error("failed to open settings json:", err);
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
  };

  const handleOpenPathInTerminal = (path: string) => {
    setTerminalCreateWorkingDirectory(path);
    setBottomPanelOpen(false);
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
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

  const handleCloseActiveTab = () => {
    const activeFile = activePane?.activeFile;
    if (!activeFile) return;
    setLayout((prev) => closeTabInPane(prev, prev.activePaneId, activeFile));
  };

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
        case AXON_COMMANDS.OPEN_PROBLEMS_PANEL:
          setBottomPanelTab("problems");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          break;
        case AXON_COMMANDS.OPEN_OUTPUT_PANEL:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          break;
        case AXON_COMMANDS.OPEN_DIFF_VIEW:
          if (activePane?.activeFile) setDiffOpen(true);
          break;
        case AXON_COMMANDS.TOGGLE_TERMINAL:
          setBottomPanelOpen(false);
          setTerminalOpen((prev) => !prev);
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
    [activePane?.activeFile, folderPath, settings],
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
        id: AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
        title: "Show Problems",
        subtitle: `${diagnostics.length} diagnostics`,
        keywords: ["diagnostics", "errors", "warnings"],
      },
      {
        id: AXON_COMMANDS.OPEN_OUTPUT_PANEL,
        title: "Show Output",
        subtitle: "Open logs, task output, and future AI output",
        keywords: ["logs", "panel"],
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
        subtitle: "Edit axon.json directly",
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
      diagnostics.length,
      folderPath,
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
        e.key.toLowerCase() === "d"
      ) {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW);
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
            onCollapsedChange={setSidebarCollapsed}
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
                      setLayout((prev) =>
                        closeTabInPane(prev, prev.activePaneId, f),
                      )
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
              setLayout((prev) => closeTabInPane(prev, paneId, f))
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
            onOpenTabInTerminal={handleOpenTabInTerminal}
            editorSettings={settings.editor}
            themeTokens={themeTokens}
            navigationTarget={navigationTarget}
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

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSettingsSave}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      {diffOpen && activePane?.activeFile && (
        <DiffModal
          filePath={activePane.activeFile}
          editorSettings={settings.editor}
          onClose={() => setDiffOpen(false)}
        />
      )}

      {splashVisible && <SplashScreen leaving={splashLeaving} />}
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
