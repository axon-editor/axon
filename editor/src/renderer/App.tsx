// Root component — owns the top-level editor state:
// - which folder is open (folderPath)
// - the file tree fetched from axon-core
// - which file is currently active in the editor
// State lives here so Sidebar, TabBar, and EditorPane all stay in sync.
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import EditorPane from "./components/EditorPane";
import StatusBar from "./components/StatusBar";
import { getTree, type FileNode } from "./lib/api";
import "./App.css";

// extend window type to include the axon API exposed by preload
declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
    };
  }
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // triggered by the "open folder" button
  // opens a native folder picker via IPC → main process → dialog API
  // then fetches the file tree from axon-core
  const handleOpenFolder = async () => {
    const path = await window.axon.openFolder();
    if (!path) return;

    setLoading(true);
    try {
      const fileTree = await getTree(path);
      setFolderPath(path);
      setTree(fileTree);
      setActiveFile(null);
    } catch (err) {
      console.error("failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0f0f] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          tree={tree}
          folderPath={folderPath}
          activeFile={activeFile}
          onFileSelect={setActiveFile}
          onOpenFolder={handleOpenFolder}
          loading={loading}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar activeFile={activeFile} onClose={() => setActiveFile(null)} />
          <EditorPane activeFile={activeFile} />
        </div>
      </div>
      <StatusBar activeFile={activeFile} />
    </div>
  );
}

export default App;
