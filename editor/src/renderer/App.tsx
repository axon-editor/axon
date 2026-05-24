// Root component — owns top-level editor state:
// - which folder is open
// - the file tree from axon-core
// - which file is active
// - which files have unsaved changes (dirty map)
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import EditorPane from "./components/EditorPane";
import StatusBar from "./components/StatusBar";
import { getTree, type FileNode } from "./lib/api";
import "./App.css";

declare global {
  interface Window {
    axon: {
      platform: string;
      openFolder: () => Promise<string | null>;
      watchFile: (path: string) => Promise<void>;
      unwatchFile: () => Promise<void>;
      onFileChanged: (
        callback: (data: { path: string; content: string }) => void,
      ) => () => void;
    };
  }
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // tracks which open files have unsaved changes
  // key: file path, value: true if dirty
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});

  const handleOpenFolder = async () => {
    const path = await window.axon.openFolder();
    if (!path) return;

    setLoading(true);
    try {
      const fileTree = await getTree(path);
      setFolderPath(path);
      setTree(fileTree);
      setActiveFile(null);
      setDirtyFiles({});
    } catch (err) {
      console.error("failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  };

  // called by EditorPane when a file's dirty state changes
  const handleDirtyChange = (path: string, dirty: boolean) => {
    setDirtyFiles((prev) => ({ ...prev, [path]: dirty }));
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
          <TabBar
            activeFile={activeFile}
            dirtyFiles={dirtyFiles}
            onClose={() => setActiveFile(null)}
          />
          <EditorPane
            activeFile={activeFile}
            onDirtyChange={handleDirtyChange}
          />
        </div>
      </div>
      <StatusBar activeFile={activeFile} />
    </div>
  );
}

export default App;
