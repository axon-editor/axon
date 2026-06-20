// Collapsible file explorer sidebar.
// Shows folder children directly without the root node.
// Folder name header is clickable and opens the FolderPicker modal.
// Recent folders persisted in localStorage under axon:recentFolders.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FolderTree, Plus, ShieldCheck, ShieldAlert } from "lucide-react";
import { type FileNode, moveEntry, getTree } from "../../shared/lib/api";
import FileTree, {
  type FileTreeOperation,
  type ImportedExternalEntry,
} from "./files/FileTree";
import ContextMenu from "./files/ContextMenu";
import FolderPicker from "./files/FolderPicker";
import { type InlineCreateKind, type InlineCreateTarget } from "./files/InlineCreateRow";
import GitHistoryView from "./history/GitHistoryView";
import {
  type GitChange,
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
  type GitFileState,
} from "../../../shared/git";
import SpotifyPanel from "../spotify/SpotifyPanel";
import type { SpotifyActions, SpotifyState } from "../spotify/lib/useSpotify";
import { clearWorkspaceSession } from "../../shared/lib/workspaceSession";
import { type WorkspaceRoot } from "../../shared/lib/workspaceRoots";

const RECENT_KEY = "axon:recentFolders";
const WORKSPACE_TRUST_KEY = "axon:workspaceTrust";
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

export function removeRecentFolder(path: string) {
  writeRecentFolders(parseRecentFolders().filter((record) => record.path !== path));
}

export function clearRecentFolders() {
  localStorage.removeItem(RECENT_KEY);
}

function readWorkspaceTrust(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(WORKSPACE_TRUST_KEY) ?? "{}",
    ) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, boolean] =>
              typeof entry[0] === "string" && typeof entry[1] === "boolean",
          ),
        )
      : {};
  } catch {
    return {};
  }
}

export function getWorkspaceTrustState(path: string | null): boolean | null {
  if (!path) return true;
  const trust = readWorkspaceTrust();
  return Object.prototype.hasOwnProperty.call(trust, path)
    ? trust[path]
    : null;
}

function isWorkspaceTrusted(path: string | null) {
  if (!path) return true;
  return getWorkspaceTrustState(path) !== false;
}

export function setWorkspaceTrusted(path: string, trusted: boolean) {
  const trust = readWorkspaceTrust();
  trust[path] = trusted;
  localStorage.setItem(WORKSPACE_TRUST_KEY, JSON.stringify(trust));
}

interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  workspaceRoots?: WorkspaceRoot[];
  activeRootId?: string | null;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onOpenFolder: () => void | Promise<void>;
  onFolderChange: (path: string, tree: FileNode) => void | Promise<void>;
  onSwitchWorkspaceRoot?: (path: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  loading: boolean;
  collapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onSplitFile: (filePath: string) => void;
  onOpenInTerminal?: (path: string) => void;
  onOpenHtmlPreview?: (filePath: string) => void;
  view: "files" | "history" | "spotify";
  onOpenGitHistoryFile: (
    commit: GitHistoryCommit,
    file: GitHistoryFile,
    diff: GitCommitDiffResult,
  ) => void;
  onEntryDeleted?: (path: string) => void;
  onEntryMoved?: (oldPath: string, newPath: string) => void;
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  gitChanges?: GitChange[];
  ignoredPaths?: string[];
  folderPickerOpen: boolean;
  onOpenFolderPicker: () => void;
  onCloseFolderPicker: () => void;
  platform: string;
  onWorkspaceTrustChanged?: () => void;
  spotifyState: SpotifyState;
  spotifyActions: SpotifyActions;
  playerOpen: boolean;
  onTogglePlayer: () => void;
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

type FileTreeOperationInput =
  | { type: "created"; path: string; isDir: boolean }
  | { type: "deleted"; path: string }
  | { type: "renamed"; oldPath: string; newPath: string }
  | { type: "moved"; oldPath: string; newPath: string };

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
      : change.worktreeState === "deleted" || change.indexState === "deleted"
        ? "D"
        : change.indexState === "added"
          ? "A"
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

function getExternalDropPaths(dataTransfer: DataTransfer) {
  return window.axon.getDroppedFilePaths(Array.from(dataTransfer.files));
}

function hasExternalFileDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

function createFileNodeFromPath(path: string, isDir: boolean): FileNode {
  return {
    name: getPathBasename(path),
    path,
    is_dir: isDir,
    children: isDir ? [] : undefined,
  };
}

function sortFileTreeChildren(children: FileNode[]) {
  return [...children].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function appendCreatedChild(
  tree: FileNode | null,
  createdPath: string,
  isDir: boolean,
) {
  if (!tree) return tree;
  if (
    normalizeTreePath(getParentPath(createdPath)) !== normalizeTreePath(tree.path)
  ) {
    return tree;
  }

  const children = tree.children ?? [];
  if (
    children.some(
      (child) =>
        normalizeTreePath(child.path) === normalizeTreePath(createdPath),
    )
  ) {
    return tree;
  }

  return {
    ...tree,
    children: sortFileTreeChildren([
      ...children,
      createFileNodeFromPath(createdPath, isDir),
    ]),
  };
}

function renamePathPrefix(path: string, oldPath: string, newPath: string) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedOldPath = normalizeTreePath(oldPath);
  if (normalizedPath === normalizedOldPath) return newPath;
  if (!normalizedPath.startsWith(`${normalizedOldPath}/`)) return path;
  return `${newPath}${path.slice(oldPath.length)}`;
}

function renameTreePaths(
  node: FileNode,
  oldPath: string,
  newPath: string,
): FileNode {
  const renamedPath = renamePathPrefix(node.path, oldPath, newPath);
  return {
    ...node,
    path: renamedPath,
    name:
      normalizeTreePath(node.path) === normalizeTreePath(oldPath)
        ? getPathBasename(newPath)
        : node.name,
    children: node.children?.map((child) =>
      renameTreePaths(child, oldPath, newPath),
    ),
  };
}

function removeTreePath(node: FileNode | null, removedPath: string): FileNode | null {
  if (!node) return node;
  const normalizedRemovedPath = normalizeTreePath(removedPath);
  if (normalizeTreePath(node.path) === normalizedRemovedPath) return null;

  return {
    ...node,
    children: node.children
      ?.filter((child) => {
        const childPath = normalizeTreePath(child.path);
        return (
          childPath !== normalizedRemovedPath &&
          !childPath.startsWith(`${normalizedRemovedPath}/`)
        );
      })
      .map((child) => removeTreePath(child, removedPath))
      .filter((child): child is FileNode => child !== null),
  };
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
  tree: treeProp,
  folderPath,
  workspaceRoots = [],
  activeRootId = null,
  activeFile,
  onFileSelect,
  onOpenFolder,
  onFolderChange,
  onSwitchWorkspaceRoot,
  onRefresh,
  loading,
  collapsed,
  width,
  onWidthChange,
  onSplitFile,
  onOpenInTerminal,
  onOpenHtmlPreview,
  view,
  onOpenGitHistoryFile,
  onEntryDeleted,
  onEntryMoved,
  onEntryRenamed,
  gitChanges,
  ignoredPaths: ignoredPathList,
  folderPickerOpen,
  onOpenFolderPicker,
  onCloseFolderPicker,
  platform,
  onWorkspaceTrustChanged,
  playerOpen,
  onTogglePlayer,
  spotifyState,
  spotifyActions,
}: Props) {
  const [tree, setTree] = useState<FileNode | null>(treeProp);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineCreate, setInlineCreate] = useState<InlineCreateTarget | null>(
    null,
  );
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [treeOperation, setTreeOperation] =
    useState<FileTreeOperation | null>(null);
  const [revokeTrustConfirmOpen, setRevokeTrustConfirmOpen] = useState(false);
  const [trustNonce, setTrustNonce] = useState(0);
  const [recentNonce, setRecentNonce] = useState(0);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    // The app shell owns the authoritative workspace tree because file watcher
    // refreshes arrive there first. The sidebar keeps a local copy only for
    // optimistic file operations such as create, rename, move, and delete. When
    // the watcher refreshes the parent tree, I replace the local copy so
    // external changes, like a new tests/ folder created by another editor,
    // appear without requiring a full Axon restart.
    setTree(treeProp);
  }, [treeProp]);

  const gitDecorations = useMemo(
    () => buildGitDecorationMap(gitChanges),
    [gitChanges],
  );
  const ignoredPaths = useMemo(
    () => buildIgnoredPathSet(ignoredPathList),
    [ignoredPathList],
  );
  const trustedWorkspace = useMemo(
    () => isWorkspaceTrusted(folderPath),
    [folderPath, trustNonce],
  );
  const recentFolders = useMemo(
    () => getRecentFolders(),
    [folderPickerOpen, recentNonce],
  );

  const toggleWorkspaceTrust = () => {
    if (!folderPath) return;
    if (trustedWorkspace) {
      setRevokeTrustConfirmOpen(true);
      return;
    }

    setWorkspaceTrusted(folderPath, !trustedWorkspace);
    setTrustNonce((nonce) => nonce + 1);
    onWorkspaceTrustChanged?.();
  };

  const revokeWorkspaceTrust = () => {
    if (!folderPath) return;
    setWorkspaceTrusted(folderPath, false);
    setTrustNonce((nonce) => nonce + 1);
    setRevokeTrustConfirmOpen(false);
    onWorkspaceTrustChanged?.();
  };

  const publishTreeOperation = (operation: FileTreeOperationInput) => {
    setTreeOperation({ ...operation, id: Date.now() });
  };

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
    const acceptsNestedRootContext =
      e.currentTarget.dataset.rootContext === "true";
    if (!tree || (!acceptsNestedRootContext && e.currentTarget !== e.target)) {
      return;
    }
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

  const handleRootDragOver = (e: ReactDragEvent) => {
    if (!tree) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect =
      hasExternalFileDrag(e.dataTransfer) ? "copy" : "move";
    setRootDragOver(true);
  };

  const handleRootDrop = (e: ReactDragEvent) => {
    if (!tree) return;
    e.preventDefault();
    e.stopPropagation();
    setRootDragOver(false);

    const externalPaths = getExternalDropPaths(e.dataTransfer);
    if (externalPaths.length > 0) {
      void handleImportExternalEntries(externalPaths, tree.path);
      return;
    }

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === tree.path) return;
    void handleMove(sourcePath, tree.path);
  };

  const handleImportExternalEntries = async (
    sourcePaths: string[],
    targetDir: string,
  ): Promise<ImportedExternalEntry[]> => {
    try {
      const importedEntries = await window.axon.importExternalEntries(
        sourcePaths,
        targetDir,
      );
      const firstImportedEntry = importedEntries[0];
      if (firstImportedEntry) {
        setRevealPath(firstImportedEntry.targetPath);
        setTree((currentTree) =>
          importedEntries.reduce(
            (nextTree, entry) =>
              appendCreatedChild(nextTree, entry.targetPath, entry.isDir),
            currentTree,
          ),
        );
        for (const entry of importedEntries) {
          publishTreeOperation({
            type: "created",
            path: entry.targetPath,
            isDir: entry.isDir,
          });
        }
      }
      await onRefresh();
      if (firstImportedEntry && !firstImportedEntry.isDir) {
        onFileSelect(firstImportedEntry.targetPath);
      }
      return importedEntries;
    } catch (err) {
      console.error("external drop import failed:", err);
      return [];
    }
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
    const nextWidth =
      resizeStartRef.current.width + e.clientX - resizeStartRef.current.x;
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
      setTree((currentTree) =>
        currentTree ? renameTreePaths(currentTree, sourcePath, movedPath) : currentTree,
      );
      publishTreeOperation({
        type: "moved",
        oldPath: sourcePath,
        newPath: movedPath,
      });
      onEntryMoved?.(sourcePath, movedPath);
      setRevealPath(movedPath);
      void onRefresh();
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
    setTree((currentTree) => appendCreatedChild(currentTree, path, isDir));
    publishTreeOperation({ type: "created", path, isDir });
    void onRefresh();
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

  const handleOpenDroppedWorkspace = async (path: string) => {
    try {
      // The no-workspace empty state is a workspace picker surface. I resolve
      // the dropped path through the same tree endpoint used by normal folder
      // selection so files are rejected naturally and only real folders become
      // the active workspace.
      const fileTree = await getTree(path);
      addRecentFolder(path);
      await onFolderChange(path, fileTree);
    } catch (err) {
      console.error("failed to open dropped workspace:", err);
    }
  };

  if (collapsed) return null;

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
              className="min-w-0 max-w-[150px] truncate rounded px-2 py-1 text-left text-[11px] font-medium text-[#9aa4b8] transition-colors hover:bg-[#11151c] hover:text-white cursor-pointer"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              {getPathBasename(folderPath)}
            </button>
            {folderPath ? (
              <button
                type="button"
                onClick={toggleWorkspaceTrust}
                aria-label={
                  trustedWorkspace
                    ? "Mark workspace untrusted"
                    : "Trust workspace"
                }
                className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
                  trustedWorkspace
                    ? "text-[#8fe3a2] hover:bg-[#152019]"
                    : "text-[#ffb454] hover:bg-[#2b2113]"
                }`}
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                {trustedWorkspace ? (
                  <ShieldCheck size={13} />
                ) : (
                  <ShieldAlert size={13} />
                )}
              </button>
            ) : null}
          </div>

          {tree && (
            <div
              onContextMenu={openRootContextMenu}
              onDragEnter={handleRootDragOver}
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
            className={`flex-1 ${
              view === "history" || view === "spotify"
                ? "overflow-hidden flex flex-col"
                : "overflow-y-auto py-1"
            }`}
            onContextMenu={handleRootContextMenu}
            onDragEnter={view === "files" ? handleRootDragOver : undefined}
            onDragOver={view === "files" ? handleRootDragOver : undefined}
            onDragLeave={
              view === "files" ? () => setRootDragOver(false) : undefined
            }
            onDrop={view === "files" ? handleRootDrop : undefined}
          >
            {view === "history" && (
              <GitHistoryView
                folderPath={folderPath}
                onOpenCommitFile={onOpenGitHistoryFile}
              />
            )}

            {view === "spotify" && (
              <SpotifyPanel
                visible={view === "spotify"}
                playerOpen={playerOpen}
                onTogglePlayer={onTogglePlayer}
                spotifyState={spotifyState}
                spotifyActions={spotifyActions}
              />
            )}

            {view === "files" && (
              <FileTree
                tree={tree}
                loading={loading}
                activeFile={activeFile}
                revealPath={revealPath}
                gitDecorations={gitDecorations}
                ignoredPaths={ignoredPaths}
                inlineCreate={inlineCreate}
                operation={treeOperation}
                onOpenFolderPicker={onOpenFolderPicker}
                onOpenDroppedWorkspace={handleOpenDroppedWorkspace}
                onRootContextMenu={handleRootContextMenu}
                onFileSelect={onFileSelect}
                onContextMenu={handleContextMenu}
                onMove={handleMove}
                onImportExternalEntries={handleImportExternalEntries}
                onInlineCreateCancel={() => setInlineCreate(null)}
                onInlineCreateCreated={handleInlineCreateCreated}
              />
            )}
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
          onRefresh={() => undefined}
          onOpenPath={(path, isDir) => {
            setRevealPath(path);
            if (isDir) {
              void onRefresh();
              return;
            }
            onFileSelect(path);
          }}
          onBeginCreate={beginInlineCreate}
          onEntryDeleted={(path) => {
            setTree((currentTree) => removeTreePath(currentTree, path));
            publishTreeOperation({ type: "deleted", path });
            onEntryDeleted?.(path);
            void onRefresh();
          }}
          onEntryRenamed={(oldPath, newPath) => {
            setTree((currentTree) =>
              currentTree
                ? renameTreePaths(currentTree, oldPath, newPath)
                : currentTree,
            );
            publishTreeOperation({ type: "renamed", oldPath, newPath });
            onEntryRenamed?.(oldPath, newPath);
            void onRefresh();
          }}
          onSplitFile={onSplitFile}
          onOpenInTerminal={onOpenInTerminal}
          onOpenHtmlPreview={onOpenHtmlPreview}
        />
      )}

      {folderPickerOpen && (
          <FolderPicker
          recentFolders={recentFolders}
          workspaceRoots={workspaceRoots}
          activeRootId={activeRootId}
          onSelect={handleSelectRecent}
          onSelectWorkspaceRoot={(path) => {
            void onSwitchWorkspaceRoot?.(path);
          }}
          onRemoveRecent={(path) => {
            removeRecentFolder(path);
            setRecentNonce((nonce) => nonce + 1);
          }}
          onClearRecent={() => {
            clearRecentFolders();
            setRecentNonce((nonce) => nonce + 1);
          }}
          onClearSession={() => {
            clearWorkspaceSession();
            onCloseFolderPicker();
          }}
          onOpenNew={async () => {
            await onOpenFolder();
            onCloseFolderPicker();
          }}
          onClose={onCloseFolderPicker}
        />
      )}

      {revokeTrustConfirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="axon-modal-panel w-full max-w-sm rounded-xl border border-[#343841] bg-[#101116] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2b2113] text-[#ffb454]">
                <ShieldAlert size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[#f2f3f5]">
                  Mark workspace untrusted?
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[#9aa0aa]">
                  Axon will stop project execution features for{" "}
                  <span className="font-medium text-[#d7d9df]">
                    {getPathBasename(folderPath)}
                  </span>
                  , including terminals, tasks, language servers, HTML preview,
                  and extension activation.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTrustConfirmOpen(false)}
                className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[#9aa0aa] transition-colors hover:bg-[#24272f] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={revokeWorkspaceTrust}
                className="h-8 cursor-pointer rounded-md border border-[#5c3320] bg-[#2b2113] px-3 text-[12px] text-[#ffcf8a] transition-colors hover:border-[#ffb454] hover:text-white"
              >
                Mark Untrusted
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
