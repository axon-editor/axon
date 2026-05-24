// Renders the collapsible file explorer sidebar.
// Sidebar can be toggled open/closed via the rail icon button.
// FileTreeNode renders recursively with collapse/expand per directory.
// Uses lucide-react for file and folder icons.
import { useState } from "react";
import { type FileNode } from "../lib/api";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileCode,
  FileJson,
  FileText,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void;
  loading: boolean;
}

// getFileIcon returns the appropriate lucide icon component for a given filename.
// Falls back to the generic File icon for unrecognised extensions.
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const props = { size: 14, className: "shrink-0" };

  if (["ts", "tsx", "js", "jsx", "go", "py", "rs", "sh"].includes(ext ?? "")) {
    return <FileCode {...props} className="shrink-0 text-[#6c5ce7]" />;
  }
  if (ext === "json") {
    return <FileJson {...props} className="shrink-0 text-yellow-500" />;
  }
  if (["md", "txt"].includes(ext ?? "")) {
    return <FileText {...props} className="shrink-0 text-neutral-400" />;
  }
  return <File {...props} className="shrink-0 text-neutral-500" />;
}

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
  // directories start expanded at depth 0, collapsed deeper down
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.is_dir) {
    return (
      <div>
        <div
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1.5 py-0.5 text-[12px] text-neutral-400 hover:text-white cursor-pointer hover:bg-[#1a1a1a] transition-colors select-none"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <span className="text-neutral-600">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          {expanded
            ? <FolderOpen size={14} className="shrink-0 text-[#6c5ce7]" />
            : <Folder size={14} className="shrink-0 text-[#6c5ce7]" />
          }
          <span className="truncate">{node.name}</span>
        </div>
        {expanded && node.children?.map((child) => (
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

  return (
    <div
      onClick={() => onFileSelect(node.path)}
      className={`flex items-center gap-1.5 py-1 text-[12px] cursor-pointer transition-colors truncate
        ${activeFile === node.path
          ? "bg-[#1e1e1e] text-white"
          : "text-neutral-400 hover:bg-[#1a1a1a] hover:text-white"
        }`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-full">
      {!collapsed && (
        <div className="w-52 bg-[#111111] border-r border-[#1f1f1f] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f1f]">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">
              {folderPath ? folderPath.split("/").pop() : "Explorer"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenFolder}
                className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
                title="Open folder"
              >
                <FolderPlus size={13} />
              </button>
              <button
                onClick={() => setCollapsed(true)}
                className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>
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
      )}

      {/* collapsed rail, shows just the toggle button */}
      {collapsed && (
        <div className="w-9 bg-[#111111] border-r border-[#1f1f1f] flex flex-col items-center py-2 gap-3">
          <button
            onClick={() => setCollapsed(false)}
            className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
      )}
    </div>
  );
}