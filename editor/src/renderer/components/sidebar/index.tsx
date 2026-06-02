// Collapsible file explorer sidebar.
// Shows folder children directly without the root node.
// Folder name header is clickable and opens the FolderPicker modal.
// Recent folders persisted in localStorage under axon:recentFolders.
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type FileNode, moveEntry, getTree } from "../../lib/api";
import FileTreeNode from "./FileTreeNode";
import ContextMenu from "./ContextMenu";
import FolderPicker from "./FolderPicker";
import Tooltip from "../Tooltip";
import { type GitChange, type GitFileState } from "../../../shared/git";

const RECENT_KEY = "axon:recentFolders";
const MAX_RECENT = 10;

interface RecentFolderRecord {
  path: string;
  lastOpenedAt: number;
}

function parseRecentFolders(): RecentFolderRecord[] {
  try {
    const rawValue = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(rawValue)) return [];

    return rawValue
      .map((item, index): RecentFolderRecord | null => {
        if (typeof item === "string") {
          return {
            path: item,
            lastOpenedAt: Date.now() - index,
          };
        }

        if (
          typeof item === "object" &&
          item !== null &&
          typeof item.path === "string"
        ) {
          return {
            path: item.path,
            lastOpenedAt:
              typeof item.lastOpenedAt === "number"
                ? item.lastOpenedAt
                : Date.now() - index,
          };
        }

        return null;
      })
      .filter((item): item is RecentFolderRecord => item !== null);
  } catch {
    return [];
  }
}

function writeRecentFolders(records: RecentFolderRecord[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(records));
}

export function addRecentFolder(path: string) {
  const records = parseRecentFolders().filter((record) => record.path !== path);
  writeRecentFolders(
    [{ path, lastOpenedAt: Date.now() }, ...records]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, MAX_RECENT),
  );
}

export function getRecentFolders(): string[] {
  const records = parseRecentFolders().sort(
    (a, b) => b.lastOpenedAt - a.lastOpenedAt,
  );
  writeRecentFolders(records.slice(0, MAX_RECENT));
  return records.map((record) => record.path);
}

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void | Promise<void>;
  onFolderChange: (path: string, tree: FileNode) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  loading: boolean;
  collapsed: boolean;
  onSplitFile: (filePath: string) => void;
  onOpenInTerminal?: (path: string) => void;
  onEntryDeleted?: (path: string) => void;
  onEntryMoved?: (oldPath: string, newPath: string) => void;
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  gitChanges?: GitChange[];
  ignoredPaths?: string[];
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
  isRoot?: boolean;
  existingNames: string[];
}

export type GitTreeTone = "added" | "modified" | "deleted" | "mixed";

export interface GitTreeDecoration {
  tone: GitTreeTone;
  label: string;
}

function normalizeTreePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function getGitToneFromState(state: GitFileState): GitTreeTone | null {
  if (state === "added" || state === "untracked") return "added";
  if (state === "deleted") return "deleted";
  if (state === "modified" || state === "renamed" || state === "copied") {
    return "modified";
  }
  return null;
}

function getGitDecorationForChange(change: GitChange): GitTreeDecoration {
  const tone =
    getGitToneFromState(change.worktreeState) ??
    getGitToneFromState(change.indexState) ??
    "modified";

  const label =
    change.worktreeState === "untracked"
      ? "U"
      : change.indexState === "added"
        ? "A"
        : change.worktreeState === "deleted" || change.indexState === "deleted"
          ? "D"
          : change.indexState === "renamed"
            ? "R"
            : "M";

  return { tone, label };
}

function mergeGitDecorations(
  current: GitTreeDecoration | undefined,
  next: GitTreeDecoration,
): GitTreeDecoration {
  if (!current) return next;
  if (current.tone === next.tone) return current;
  return { tone: "mixed", label: "*" };
}

function buildGitDecorationMap(gitChanges: GitChange[] = []) {
  const decorations = new Map<string, GitTreeDecoration>();

  for (const change of gitChanges) {
    const decoration = getGitDecorationForChange(change);
    let currentPath = normalizeTreePath(change.absolutePath);

    while (currentPath) {
      decorations.set(
        currentPath,
        mergeGitDecorations(decorations.get(currentPath), decoration),
      );

      const nextPath = currentPath.split("/").slice(0, -1).join("/");
      if (nextPath === currentPath) break;
      currentPath = nextPath;
    }
  }

  return decorations;
}

function buildIgnoredPathSet(ignoredPaths: string[] = []) {
  return new Set(ignoredPaths.map(normalizeTreePath));
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
  onSplitFile,
  onOpenInTerminal,
  onEntryDeleted,
  onEntryMoved,
  onEntryRenamed,
  gitChanges,
  ignoredPaths: ignoredPathList,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const gitDecorations = useMemo(
    () => buildGitDecorationMap(gitChanges),
    [gitChanges],
  );
  const ignoredPaths = useMemo(
    () => buildIgnoredPathSet(ignoredPathList),
    [ignoredPathList],
  );

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
      const movedPath = `${targetDir}/${sourcePath.split("/").pop()}`;
      onEntryMoved?.(sourcePath, movedPath);
      setRevealPath(movedPath);
      await onRefresh();
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

  if (collapsed) return null;

  return (
    <>
      <div className="flex h-full">
        <div className="w-52 bg-[var(--axon-sidebar-background)] border-r border-[var(--axon-sidebar-border)] flex flex-col overflow-hidden">
            <div
              className="flex items-center px-3 border-b border-[var(--axon-sidebar-border)] pt-8 pb-2"
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
                    gitDecorations={gitDecorations}
                    ignoredPaths={ignoredPaths}
                  />
                ))}
            </div>
          </div>
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
              void onRefresh();
              return;
            }
            onFileSelect(path);
          }}
          onEntryDeleted={onEntryDeleted}
          onEntryRenamed={onEntryRenamed}
          onSplitFile={onSplitFile}
          onOpenInTerminal={onOpenInTerminal}
        />
      )}

      {pickerOpen && (
        <FolderPicker
          recentFolders={getRecentFolders()}
          onSelect={handleSelectRecent}
          onOpenNew={async () => {
            await onOpenFolder();
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
