import { useState, useEffect } from "react";
import Sidebar, { addRecentFolder } from "./components/sidebar/index";
import EditorPane from "./components/EditorPane/index";
import StatusBar from "./components/StatusBar";
import Terminal from "./components/Terminal";
import CommandPalette from "./components/CommandPalette";
import EditorToolbar from "./components/EditorToolbar";
import SettingsModal from "./components/SettingsModal";
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
} from "./lib/layoutManager";
import { type Layout, type SplitDirection } from "./lib/types";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
} from "../shared/settings";
import "./App.css";

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      getSettings: () => Promise<AxonSettings>;
      updateSettings: (settings: AxonSettings) => Promise<AxonSettings>;
      copyText: (text: string) => Promise<void>;
      watchFile: (path: string) => Promise<void>;
      unwatchFile: () => Promise<void>;
      watchFolder: (path: string) => Promise<void>;
      unwatchFolder: () => Promise<void>;
      onFileChanged: (
        callback: (data: { path: string; content: string }) => void,
      ) => () => void;
      onFolderChanged: (callback: () => void) => () => void;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AxonSettings>(DEFAULT_SETTINGS);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activePane = layout.panes.find((p) => p.id === layout.activePaneId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setTerminalOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zenMode]);

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
                onNewFile={handleNewFile}
                onOpenFile={() => setPaletteOpen(true)}
                onNewTerminal={handleNewTerminal}
                onSplit={handleSplit}
                onZenMode={() => setZenMode((p) => !p)}
                onSettings={() => setSettingsOpen(true)}
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
          onToggleSidebar={() => setSidebarCollapsed((p) => !p)}
          onToggleTerminal={() => setTerminalOpen((p) => !p)}
        />
      )}

      <CommandPalette
        tree={tree}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFileSelect={handleFileSelect}
      />

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSettingsSave}
        />
      )}
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
