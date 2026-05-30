import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import EditorPane from "./components/EditorPane";
import StatusBar from "./components/StatusBar";
import { getTree, type FileNode } from "./lib/api";
import "./App.css";
import CommandPalette from "./components/CommandPalette";

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
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
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [language, setLanguage] = useState("plaintext");

  // starts folder watcher when a folder is opened and registers
  // the onFolderChanged listener to auto-refresh the tree
  const handleOpenFolder = async () => {
    const path = await window.axon.openFolder();
    if (!path) return;

    setLoading(true);
    try {
      const fileTree = await getTree(path);
      setFolderPath(path);
      setTree(fileTree);
      setOpenTabs([]);
      setActiveFile(null);
      setDirtyFiles({});

      // start watching the folder for external changes
      window.axon.watchFolder(path);
    } catch (err) {
      console.error("failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // register folder change listener once on mount.
  // when chokidar detects any add/unlink/addDir/unlinkDir event
  // we refresh the tree so the sidebar stays in sync with disk.
  useEffect(() => {
    const cleanup = window.axon.onFolderChanged(() => {
      if (!folderPath) return;
      getTree(folderPath)
        .then(setTree)
        .catch((err) => console.error("tree refresh failed:", err));
    });
    return cleanup;
  }, [folderPath]);

  const handleReorder = (newTabs: string[]) => {
    setOpenTabs(newTabs);
  };

  // open a file tab or focus it if already open
  const handleFileSelect = (path: string) => {
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
    setActiveFile(path);
  };

  // close a tab and focus the nearest remaining tab
  const handleCloseTab = (path: string) => {
    const index = openTabs.indexOf(path);
    const newTabs = openTabs.filter((t) => t !== path);

    setOpenTabs(newTabs);

    // clean up dirty state for the closed tab
    setDirtyFiles((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });

    if (activeFile === path) {
      if (newTabs.length === 0) {
        setActiveFile(null);
      } else {
        // focus the tab to the left, or the first tab if closing the leftmost
        const nextIndex = Math.max(0, index - 1);
        setActiveFile(newTabs[nextIndex]);
      }
    }
  };

  const handleDirtyChange = (path: string, dirty: boolean) => {
    setDirtyFiles((prev) => ({ ...prev, [path]: dirty }));
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0f0f] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          tree={tree}
          folderPath={folderPath}
          activeFile={activeFile}
          onFileSelect={handleFileSelect}
          onOpenFolder={handleOpenFolder}
          onRefresh={handleRefresh}
          loading={loading}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            openTabs={openTabs}
            activeFile={activeFile}
            dirtyFiles={dirtyFiles}
            onSelect={setActiveFile}
            onClose={handleCloseTab}
            onReorder={handleReorder}
          />
          <EditorPane
            activeFile={activeFile}
            openTabs={openTabs}
            onDirtyChange={handleDirtyChange}
            onCursorChange={(line, col) => setCursorInfo({ line, col })}
            onLanguageChange={setLanguage}
          />
        </div>
      </div>

      <StatusBar
        activeFile={activeFile}
        language={language}
        cursor={cursorInfo}
      />

      <CommandPalette
        tree={tree}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFileSelect={handleFileSelect}
      />
    </div>
  );
}

export default App;
