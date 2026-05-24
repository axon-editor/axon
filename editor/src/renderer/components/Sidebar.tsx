// Renders the file explorer sidebar.
// Receives the file tree from App and renders it recursively via FileTreeNode.
// Also owns the "open folder" button that triggers the native folder picker.
import { type FileNode } from "../lib/api";

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void;
  loading: boolean;
}

// FileTreeNode recursively renders a FileNode and its children.
// Directories are rendered as non-clickable labels with indentation.
// Files are clickable and highlight when active.
function FileTreeNode({
  node,
  activeFile,
  onFileSelect,
  depth = 0,
}: {
  node: FileNode;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  depth?: number;
}) {
  if (node.is_dir) {
    return (
      <div>
        {/* directory label, not clickable, just a visual grouping */}
        <div
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-neutral-500 uppercase tracking-widest"
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <span>▸</span>
          <span>{node.name}</span>
        </div>
        {/* render children recursively with increased depth for indentation */}
        {node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  // file node, clickable, highlights when it's the active file
  return (
    <div
      onClick={() => onFileSelect(node.path)}
      className={`px-2 py-1 text-[13px] cursor-pointer transition-colors
        ${
          activeFile === node.path
            ? "bg-[#1e1e1e] text-white"
            : "text-neutral-400 hover:bg-[#1a1a1a] hover:text-white"
        }`}
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      {node.name}
    </div>
  );
}

export default function Sidebar({
  tree,
  folderPath,
  activeFile,
  onFileSelect,
  onOpenFolder,
  loading,
}: Props) {
  return (
    <div className="w-52 bg-[#111111] border-r border-[#1f1f1f] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f1f]">
        <span className="text-[10px] text-neutral-500 uppercase tracking-widest">
          {folderPath ? folderPath.split("/").pop() : "Explorer"}
        </span>
        <button
          onClick={onOpenFolder}
          className="text-[11px] text-neutral-500 hover:text-white transition-colors cursor-pointer"
          title="Open folder"
        >
          ⊕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-2 text-[12px] text-neutral-600">
            loading...
          </div>
        )}
        {!loading && !tree && (
          <div
            onClick={onOpenFolder}
            className="px-4 py-3 text-[12px] text-neutral-600 hover:text-neutral-400 cursor-pointer transition-colors"
          >
            open a folder to start
          </div>
        )}
        {!loading && tree && (
          <FileTreeNode
            node={tree}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
          />
        )}
      </div>
    </div>
  );
}
