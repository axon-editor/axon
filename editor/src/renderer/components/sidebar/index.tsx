// Collapsible file explorer sidebar.
// Shows folder children directly without the root node.
// Folder name header is clickable and opens the FolderPicker modal.
// Recent folders persisted in localStorage under axon:recentFolders.
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FolderTree, Plus } from "lucide-react";
import { type FileNode, moveEntry, getTree } from "../../lib/api";
import FileTreeNode from "./FileTreeNode";
import ContextMenu from "./ContextMenu";
import FolderPicker from "./FolderPicker";
import InlineCreateRow, {
  type InlineCreateKind,
  type InlineCreateTarget,
} from "./InlineCreateRow";
import { publicAsset } from "../../lib/assets";
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
  width: number;
  onWidthChange: (width: number) => void;
  onSplitFile: (filePath: string) => void;
  onOpenInTerminal?: (path: string) => void;
  onOpenHtmlPreview?: (filePath: string) => void;
  onEntryDeleted?: (path: string) => void;
  onEntryMoved?: (oldPath: string, newPath: string) => void;
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  gitChanges?: GitChange[];
  ignoredPaths?: string[];
  folderPickerOpen: boolean;
  onOpenFolderPicker: () => void;
  onCloseFolderPicker: () => void;
  platform: string;
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
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join(separator);
}

function getPathBasename(path: string | null) {
  if (!path) return "open folder";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "open folder";
}

function joinTreePath(parentPath: string, name: string) {
  const separator = parentPath.includes("\\") ? "\\" : "/";
  return `${parentPath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function getSiblingNames(tree: FileNode | null, node: FileNode) {
  if (!tree) return [];
  if (tree.path === node.path) {
    return tree.children?.map((child) => child.name) ?? [];
  }

  const parent = findNodeByPath(tree, getParentPath(node.path));
  return parent?.children?.map((child) => child.name) ?? [];
}

function getChildNamesForPath(tree: FileNode | null, parentPath: string) {
  const parent = findNodeByPath(tree, parentPath);
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
  width,
  onWidthChange,
  onSplitFile,
  onOpenInTerminal,
  onOpenHtmlPreview,
  onEntryDeleted,
  onEntryMoved,
  onEntryRenamed,
  gitChanges,
  ignoredPaths: ignoredPathList,
  folderPickerOpen,
  onOpenFolderPicker,
  onCloseFolderPicker,
  platform,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineCreate, setInlineCreate] =
    useState<InlineCreateTarget | null>(null);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
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

  const openRootContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!tree) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: e.type === "contextmenu" ? e.clientX : rect.left + 8,
      y: e.type === "contextmenu" ? e.clientY : rect.bottom + 4,
      node: tree,
      isRoot: true,
      existingNames: tree.children?.map((child) => child.name) ?? [],
    });
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!tree) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setRootDragOver(true);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    if (!tree) return;
    e.preventDefault();
    e.stopPropagation();
    setRootDragOver(false);

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === tree.path) return;
    void handleMove(sourcePath, tree.path);
  };

  const handleResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    const nextWidth = resizeStartRef.current.width + e.clientX - resizeStartRef.current.x;
    onWidthChange(Math.min(360, Math.max(176, nextWidth)));
  };

  const handleResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const handleMove = async (sourcePath: string, targetDir: string) => {
    try {
      await moveEntry(sourcePath, targetDir);
      const movedPath = joinTreePath(targetDir, getPathBasename(sourcePath));
      onEntryMoved?.(sourcePath, movedPath);
      setRevealPath(movedPath);
      await onRefresh();
    } catch (err) {
      console.error("move failed:", err);
    }
  };

  const beginInlineCreate = async (
    parentPath: string,
    kind: InlineCreateKind,
  ) => {
    if (!tree) return;

    const fallbackNames = getChildNamesForPath(tree, parentPath);
    try {
      // The sidebar tree is intentionally loaded lazily, so a folder can have
      // children in the backend even when this component has not fetched them
      // yet. I refresh the target folder before showing the input so duplicate
      // names can be caught in the UI instead of only failing after the create
      // request reaches axon-core.
      const parentTree = await getTree(parentPath);
      setInlineCreate({
        parentPath,
        kind,
        existingNames: parentTree.children?.map((child) => child.name) ?? [],
      });
    } catch {
      setInlineCreate({
        parentPath,
        kind,
        existingNames: fallbackNames,
      });
    }

    setRevealPath(parentPath);
  };

  const handleInlineCreateCreated = async (path: string, isDir: boolean) => {
    setInlineCreate(null);
    setRevealPath(path);
    await onRefresh();
    if (!isDir) onFileSelect(path);
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

  if (collapsed) return null;

  const showEmptySidebar =
    !loading && (!tree || ((tree.children?.length ?? 0) === 0 && !inlineCreate));
  const hasMacTrafficLights = platform === "darwin";

  return (
    <>
      <div className="flex h-full">
        <div
          className="relative flex flex-col overflow-hidden border-r bg-[var(--axon-sidebar-background)] border-[var(--axon-sidebar-border)]"
          style={{ width }}
        >
          <div
            className={`flex h-9 items-center justify-between border-b border-[var(--axon-sidebar-border)] px-3 ${
              hasMacTrafficLights ? "pl-20" : "pl-2"
            }`}
            style={{ WebkitAppRegion: "drag" } as any}
          >
            <button
              type="button"
              onClick={onOpenFolderPicker}
              aria-label="Select folder"
              className="max-w-[180px] truncate rounded px-2 py-1 text-left text-[11px] font-medium text-[#9aa4b8] transition-colors hover:bg-[#11151c] hover:text-white cursor-pointer"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              {getPathBasename(folderPath)}
            </button>
          </div>

          {tree && (
            <div
              onContextMenu={openRootContextMenu}
              onDragOver={handleRootDragOver}
              onDragLeave={() => setRootDragOver(false)}
              onDrop={handleRootDrop}
              className={`flex h-8 shrink-0 items-center justify-between border-b border-[var(--axon-sidebar-border)] px-2 text-[11px] transition-colors ${
                rootDragOver
                  ? "bg-[#182436] text-white"
                  : "bg-[#090c12] text-[#586478]"
              }`}
            >
              <button
                type="button"
                onClick={openRootContextMenu}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[#11151c] hover:text-white"
              >
                <FolderTree size={12} className="shrink-0" />
                <span className="truncate">workspace root</span>
              </button>
              <button
                type="button"
                onClick={openRootContextMenu}
                aria-label="New root item"
                className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#11151c] hover:text-[#80c8e0]"
              >
                <Plus size={12} />
              </button>
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto py-1"
            onContextMenu={handleRootContextMenu}
          >
            {loading && (
              <div className="px-4 py-2 text-[12px] text-[#364050]">
                loading...
              </div>
            )}

            {showEmptySidebar && (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <img
                  src={publicAsset("axon.png")}
                  alt="Axon"
                  className="mb-3 h-12 w-12 opacity-25"
                  draggable={false}
                />
                <div className="text-[12px] font-medium text-[#c8d0e0]">
                  no folder open
                </div>
                <div className="mt-1 max-w-[160px] text-[11px] leading-4 text-[#586478]">
                  use the folder button above to open a workspace.
                </div>
                <button
                  type="button"
                  onClick={onOpenFolderPicker}
                  className="mt-4 flex h-7 cursor-pointer items-center rounded border border-[#222838] px-3 text-[11px] text-[#9aa4b8] transition-colors hover:border-[#3a455a] hover:bg-[#11151c] hover:text-white"
                >
                  open folder
                </button>
              </div>
            )}

            {!loading &&
              tree &&
              inlineCreate?.parentPath === tree.path && (
                <InlineCreateRow
                  target={inlineCreate}
                  depth={0}
                  onCancel={() => setInlineCreate(null)}
                  onCreated={handleInlineCreateCreated}
                />
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
                  inlineCreate={inlineCreate}
                  onInlineCreateCancel={() => setInlineCreate(null)}
                  onInlineCreateCreated={handleInlineCreateCreated}
                />
              ))}
          </div>
          <div
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="absolute bottom-0 right-0 top-0 w-1 cursor-col-resize hover:bg-[#80c8e0]/60"
            aria-hidden="true"
          />
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
          onBeginCreate={beginInlineCreate}
          onEntryDeleted={onEntryDeleted}
          onEntryRenamed={onEntryRenamed}
          onSplitFile={onSplitFile}
          onOpenInTerminal={onOpenInTerminal}
          onOpenHtmlPreview={onOpenHtmlPreview}
        />
      )}

      {folderPickerOpen && (
        <FolderPicker
          recentFolders={getRecentFolders()}
          onSelect={handleSelectRecent}
          onOpenNew={async () => {
            await onOpenFolder();
            onCloseFolderPicker();
          }}
          onClose={onCloseFolderPicker}
        />
      )}
    </>
  );
}
