// Renders the collapsible file explorer sidebar.
// Sidebar can be toggled open/closed via the rail icon button.
// FileTreeNode renders recursively with collapse/expand per directory.
// Right clicking a file or directory opens a context menu with
// create file, create folder, and delete options.
// Uses lucide-react for file and folder icons.
import { useState, useEffect, useRef } from "react";
import { type FileNode, createFile, createDir, deleteEntry } from "../lib/api";
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
  FilePlus,
  Trash2,
} from "lucide-react";

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  loading: boolean;
}

interface InputPrompt {
  type: "file" | "folder" | "delete";
  node: FileNode;
  x: number;
  y: number;
}

interface ContextMenu {
  x: number;
  y: number;
  node: FileNode;
}

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
  onContextMenu,
  depth = 0,
}: {
  node: FileNode;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.is_dir) {
    return (
      <div>
        <div
          onClick={() => setExpanded((p) => !p)}
          onContextMenu={(e) => onContextMenu(e, node)}
          className="flex items-center gap-1.5 py-0.5 text-[12px] text-neutral-400 hover:text-white cursor-pointer hover:bg-[#1a1a1a] transition-colors select-none"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <span className="text-neutral-600">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          {expanded ? (
            <FolderOpen size={14} className="shrink-0 text-[#6c5ce7]" />
          ) : (
            <Folder size={14} className="shrink-0 text-[#6c5ce7]" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {expanded &&
          node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onFileSelect(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
      className={`flex items-center gap-1.5 py-1 text-[12px] cursor-pointer transition-colors truncate
        ${
          activeFile === node.path
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

// ContextMenuPopup renders a floating action menu at the cursor position.
// Closes when clicking outside via a document mousedown listener.
// For create actions it renders an inline input instead of using prompt()
// since Electron blocks native browser dialogs by default.
function ContextMenuPopup({
  menu,
  onClose,
  onRefresh,
}: {
  menu: ContextMenu;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"menu" | "file" | "folder" | "delete">(
    "menu",
  );
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // focus input whenever mode switches to file or folder creation
  useEffect(() => {
    if (mode === "file" || mode === "folder") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const basePath = menu.node.is_dir
    ? menu.node.path
    : menu.node.path.split("/").slice(0, -1).join("/");

  const handleConfirmCreate = async () => {
    const name = inputValue.trim();
    if (!name) return;
    if (mode === "file") await createFile(`${basePath}/${name}`);
    if (mode === "folder") await createDir(`${basePath}/${name}`);
    onRefresh();
    onClose();
  };

  const handleDelete = async () => {
    await deleteEntry(menu.node.path);
    onRefresh();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirmCreate();
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded shadow-xl py-1 min-w-48"
      style={{ top: menu.y, left: menu.x }}
    >
      {mode === "menu" && (
        <>
          <button
            onClick={() => setMode("file")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors cursor-pointer"
          >
            <FilePlus size={12} />
            new file
          </button>
          <button
            onClick={() => setMode("folder")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-neutral-300 hover:bg-[#2a2a2a] hover:text-white transition-colors cursor-pointer"
          >
            <FolderPlus size={12} />
            new folder
          </button>
          <div className="my-1 border-t border-[#2a2a2a]" />
          <button
            onClick={() => setMode("delete")}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-[#2a2a2a] hover:text-red-300 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            delete
          </button>
        </>
      )}

      {(mode === "file" || mode === "folder") && (
        <div className="px-3 py-2 flex flex-col gap-2">
          <span className="text-[11px] text-neutral-500">
            {mode === "file" ? "file name" : "folder name"}
          </span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-[#0f0f0f] border border-[#3a3a3a] rounded px-2 py-1 text-[12px] text-white outline-none focus:border-[#6c5ce7] w-full"
            placeholder={mode === "file" ? "index.go" : "pkg"}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="text-[11px] text-neutral-500 hover:text-white px-2 py-1 cursor-pointer"
            >
              cancel
            </button>
            <button
              onClick={handleConfirmCreate}
              className="text-[11px] bg-[#6c5ce7] text-white px-3 py-1 rounded hover:bg-[#7d6ef8] cursor-pointer"
            >
              create
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="px-3 py-2 flex flex-col gap-2">
          <span className="text-[11px] text-neutral-400">
            delete <span className="text-white">{menu.node.name}</span>?
          </span>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="text-[11px] text-neutral-500 hover:text-white px-2 py-1 cursor-pointer"
            >
              cancel
            </button>
            <button
              onClick={handleDelete}
              className="text-[11px] bg-red-500 text-white px-3 py-1 rounded hover:bg-red-400 cursor-pointer"
            >
              delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  tree,
  folderPath,
  activeFile,
  onFileSelect,
  onOpenFolder,
  onRefresh,
  loading,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  return (
    <>
      <div className="flex h-full">
        {!collapsed && (
          <div className="w-52 bg-[#111111] border-r border-[#1f1f1f] flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f1f] pt-8"
              style={{ WebkitAppRegion: "drag" } as any}
            >
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest truncate">
                {folderPath ? folderPath.split("/").pop() : "Explorer"}
              </span>
              <div
                className="flex items-center gap-2 shrink-0"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                <button
                  onClick={onOpenFolder}
                  className="text-neutral-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  title="Open folder"
                >
                  <FolderPlus size={13} />
                </button>
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-neutral-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
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
                  onContextMenu={handleContextMenu}
                />
              )}
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-9 bg-[#111111] border-r border-[#1f1f1f] flex flex-col items-center py-2 gap-3 pt-8">
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

      {contextMenu && (
        <ContextMenuPopup
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}
