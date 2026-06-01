import { useState, useEffect, useCallback } from "react";
import Sidebar, { addRecentFolder } from "./components/sidebar/index";
import EditorPane from "./components/EditorPane/index";
import StatusBar from "./components/StatusBar";
import Terminal from "./components/Terminal";
import CommandPalette from "./components/CommandPalette";
import WorkspaceSearchModal from "./components/WorkspaceSearchModal";
import BottomPanel, { type BottomPanelTab } from "./components/BottomPanel";
import EditorToolbar from "./components/EditorToolbar";
import SettingsModal from "./components/SettingsModal";
import SplashScreen from "./components/SplashScreen";
import AboutModal, { type AppInfo } from "./components/AboutModal";
import { getTree, createFile, type FileNode } from "./lib/api";
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
import "./App.css";

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      getSettings: () => Promise<AxonSettings>;
      updateSettings: (settings: AxonSettings) => Promise<AxonSettings>;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);

  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);

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
      .getSettings()
      .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
      .catch((err) => {
        console.error("failed to load settings:", err);
      });
  }, []);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged(() => {
      if (!folderPath) return;
      getTree(folderPath).then(setTree).catch(console.error);
    });
    return cleanup;
  }, [folderPath]);

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

    await window.axon.unwatchFolder();
    await window.axon.watchFolder(path);
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
        await window.axon.updateSettings(normalizedSettings);
      setSettings(normalizeSettings(savedSettings));
    } catch (err) {
      console.error("failed to save settings:", err);
    }
  };

  const handleNewTerminal = () => {
    setTerminalCreateWorkingDirectory(null);
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
    setTerminalOpen(true);
    setTerminalCreateNonce((nonce) => nonce + 1);
  };

  const handleOpenPathInTerminal = (path: string) => {
    setTerminalCreateWorkingDirectory(path);
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
          break;
        case AXON_COMMANDS.OPEN_OUTPUT_PANEL:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          break;
        case AXON_COMMANDS.TOGGLE_TERMINAL:
          setTerminalOpen((prev) => !prev);
          break;
        case AXON_COMMANDS.OPEN_SETTINGS:
          setSettingsOpen(true);
          break;
        case AXON_COMMANDS.TOGGLE_ZEN_MODE:
          setZenMode((prev) => !prev);
          break;
        case AXON_COMMANDS.NEW_TERMINAL:
          handleNewTerminal();
          break;
      }
    },
    [activePane?.activeFile, folderPath],
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
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SETTINGS);
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
      style={{ background: "#0e1018" }}
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#14161e] border border-[#222838] rounded text-[11px] text-[#586478] hover:text-white hover:border-[#80c8e0] transition-colors cursor-pointer"
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
            <div className="flex items-center bg-[#0a0c12] border-b border-[#222838] pr-1">
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
            handleOpenFolder={handleOpenFolder}
            handleNewFile={handleNewFile}
            handleFolderChange={handleFolderChange}
          />

          <BottomPanel
            open={bottomPanelOpen && !zenMode}
            activeTab={bottomPanelTab}
            onActiveTabChange={setBottomPanelTab}
            onClose={() => setBottomPanelOpen(false)}
          />

          <Terminal
            open={terminalOpen && !zenMode}
            createNonce={terminalCreateNonce}
            createWorkingDirectory={terminalCreateWorkingDirectory}
            editorSettings={settings.editor}
            workingDirectory={folderPath}
            onHide={() => setTerminalOpen(false)}
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
        onClose={() => setPaletteOpen(false)}
        onFileSelect={handleFileSelect}
      />

      <WorkspaceSearchModal
        rootPath={folderPath}
        open={workspaceSearchOpen}
        onClose={() => setWorkspaceSearchOpen(false)}
        onFileSelect={handleFileSelect}
      />

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSettingsSave}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

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
