// Collapsible file explorer sidebar.
// Shows folder children directly without the root node.
// Folder name header is clickable and opens the FolderPicker modal.
// Recent folders persisted in localStorage under axon:recentFolders.
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, ChevronDown } from "lucide-react";
import { type FileNode, moveEntry, getTree } from "../../lib/api";
import FileTreeNode from "./FileTreeNode";
import ContextMenu from "./ContextMenu";
import FolderPicker from "./FolderPicker";
import Tooltip from "../Tooltip";

const RECENT_KEY = "axon:recentFolders";
const MAX_RECENT = 10;

export function addRecentFolder(path: string) {
  const existing = getRecentFolders();
  const updated = [path, ...existing.filter((p) => p !== path)].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

export function getRecentFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void;
  onFolderChange: (path: string, tree: FileNode) => void | Promise<void>;
  onRefresh: () => void;
  loading: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSplitFile: (filePath: string) => void;
  onOpenInTerminal?: (path: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
  isRoot?: boolean;
  existingNames: string[];
}

function findNodeByPath(node: FileNode | null, path: string): FileNode | null {
  if (!node) return null;
  if (node.path === path) return node;

  for (const child of node.children ?? []) {
    const match = findNodeByPath(child, path);
    if (match) return match;
  }

  return null;
}

function getParentPath(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

function getSiblingNames(tree: FileNode | null, node: FileNode) {
  if (!tree) return [];
  if (tree.path === node.path) {
    return tree.children?.map((child) => child.name) ?? [];
  }

  const parent = findNodeByPath(tree, getParentPath(node.path));
  return parent?.children?.map((child) => child.name) ?? [];
}

export default function Sidebar({
  tree,
  folderPath,
  activeFile,
  onFileSelect,
  onOpenFolder,
  onFolderChange,
  onRefresh,
  loading,
  collapsed,
  onCollapsedChange,
  onSplitFile,
  onOpenInTerminal,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      existingNames: getSiblingNames(tree, node),
    });
  };

  const handleRootContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tree || e.currentTarget !== e.target) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: tree,
      isRoot: true,
      existingNames: tree.children?.map((child) => child.name) ?? [],
    });
  };

  const handleMove = async (sourcePath: string, targetDir: string) => {
    try {
      await moveEntry(sourcePath, targetDir);
      setRevealPath(`${targetDir}/${sourcePath.split("/").pop()}`);
      onRefresh();
    } catch (err) {
      console.error("move failed:", err);
    }
  };

  // open a recent folder directly without the native dialog
  const handleSelectRecent = async (path: string) => {
    try {
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await onFolderChange(path, fileTree);
    } catch (err) {
      console.error("failed to open recent folder:", err);
    }
  };

  const folderName = folderPath ? folderPath.split("/").pop() : null;

  return (
    <>
      <div className="flex h-full">
        {!collapsed && (
          <div className="w-52 bg-[#0a0c12] border-r border-[#222838] flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-3 border-b border-[#222838] pt-8 pb-2"
              style={{ WebkitAppRegion: "drag" } as any}
            >
              <Tooltip label="Switch folder" side="bottom">
                <button
                  onClick={() => setPickerOpen(true)}
                  aria-label="Switch folder"
                  className="flex items-center gap-1 text-[11px] text-[#9aa4b8] hover:text-[#80c8e0] transition-colors cursor-pointer truncate max-w-[140px]"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  <span className="truncate font-medium">
                    {folderName ?? "open folder"}
                  </span>
                  <ChevronDown size={11} className="shrink-0" />
                </button>
              </Tooltip>

              <Tooltip label="Collapse sidebar" side="bottom">
                <button
                  onClick={() => onCollapsedChange(true)}
                  aria-label="Collapse sidebar"
                  className="text-[#586478] hover:text-[#80c8e0] transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  <PanelLeftClose size={13} />
                </button>
              </Tooltip>
            </div>

            <div
              className="flex-1 overflow-y-auto py-1"
              onContextMenu={handleRootContextMenu}
            >
              {loading && (
                <div className="px-4 py-2 text-[12px] text-[#364050]">
                  loading...
                </div>
              )}
              {!loading && !tree && (
                <div
                  onClick={() => setPickerOpen(true)}
                  className="px-4 py-3 text-[12px] text-[#364050] hover:text-[#586478] cursor-pointer transition-colors"
                >
                  open a folder to start
                </div>
              )}
              {!loading &&
                tree &&
                tree.children?.map((child) => (
                  <FileTreeNode
                    key={child.path}
                    node={child}
                    activeFile={activeFile}
                    onFileSelect={onFileSelect}
                    onContextMenu={handleContextMenu}
                    onMove={handleMove}
                    revealPath={revealPath}
                  />
                ))}
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-9 bg-[#0a0c12] border-r border-[#222838] flex flex-col items-center pt-8 gap-3">
            <Tooltip label="Expand sidebar" side="right">
              <button
                onClick={() => onCollapsedChange(false)}
                aria-label="Expand sidebar"
                className="text-[#586478] hover:text-[#80c8e0] transition-colors cursor-pointer"
              >
                <PanelLeftOpen size={14} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          existingNames={contextMenu.existingNames}
          onRefresh={onRefresh}
          onOpenPath={(path, isDir) => {
            setRevealPath(path);
            if (isDir) {
              onRefresh();
              return;
            }
            onFileSelect(path);
          }}
          onSplitFile={onSplitFile}
          onOpenInTerminal={onOpenInTerminal}
        />
      )}

      {pickerOpen && (
        <FolderPicker
          recentFolders={getRecentFolders()}
          onSelect={handleSelectRecent}
          onOpenNew={() => {
            void onOpenFolder();
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
