/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderTree,
} from "lucide-react";
import CommandModal from "../../shared/components/modals/CommandModal";
import { getTree, type FileNode } from "../../shared/lib/backend/api";
import {
  getFileIcon,
  getFolderIcon,
} from "../sidebar/files/lib/icons/fileIcons";
import type { GitChange, GitFileState } from "../../../shared/workspace/git";

// Cmd+B in zen opens this read-only tree instead of widening the sidebar back
// into the canvas. It keeps the sidebar's lazy getTree expansion and git tone
// paint, but leaves rename, drag, and context-menu operations behind so the
// modal stays a navigation surface.
interface Props {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  gitChanges: GitChange[];
  ignoredPaths: string[];
  loading: boolean;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}

interface TreeRow {
  node: FileNode;
  depth: number;
}

type GitTone = "added" | "modified" | "deleted" | "mixed";

const ZEN_TREE_MODAL_WIDTH = "w-[clamp(30rem,42vw,46rem)]";
const TREE_BASE_INDENT = 8;
const TREE_DEPTH_WIDTH = 13;
const FOCUS_DELAY_MS = 40;

const GIT_TONE_COLORS: Record<GitTone, string> = {
  added: "var(--axon-git-added)",
  modified: "var(--axon-git-modified)",
  deleted: "var(--axon-git-deleted)",
  mixed: "var(--axon-git-mixed)",
};
const IGNORED_ENTRY_COLOR =
  "color-mix(in srgb, var(--axon-editor-foreground) 56%, transparent)";

function normalizeTreePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function sortChildren(children: FileNode[]) {
  return [...children].sort((left, right) => {
    if (left.is_dir !== right.is_dir) return left.is_dir ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

// The core returns one directory level at a time, so revealing the active file
// means expanding and fetching every directory between the workspace root and
// the file. The built paths keep the root's separator so they match the raw
// node.path values stored by the lazy child cache.
function getAncestorPaths(filePath: string, rootPath: string) {
  const normalizedFile = normalizeTreePath(filePath);
  const normalizedRoot = normalizeTreePath(rootPath);
  if (!normalizedFile.startsWith(`${normalizedRoot}/`)) return [];

  const relative = normalizedFile.slice(normalizedRoot.length + 1);
  const segments = relative.split("/");
  segments.pop();

  const separator = rootPath.includes("\\") ? "\\" : "/";
  let current = rootPath.replace(/[\\/]+$/, "");
  return segments.map((segment) => {
    current = `${current}${separator}${segment}`;
    return current;
  });
}

function flattenRows(
  nodes: FileNode[],
  depth: number,
  expandedPaths: Set<string>,
  childrenByPath: Map<string, FileNode[]>,
  rows: TreeRow[] = [],
) {
  for (const node of nodes) {
    rows.push({ node, depth });

    if (node.is_dir && expandedPaths.has(node.path)) {
      const children = childrenByPath.get(node.path) ?? node.children ?? [];
      flattenRows(
        sortChildren(children),
        depth + 1,
        expandedPaths,
        childrenByPath,
        rows,
      );
    }
  }

  return rows;
}

function getGitToneFromState(state: GitFileState): GitTone | null {
  if (state === "added" || state === "untracked") return "added";
  if (state === "deleted") return "deleted";
  if (state === "modified" || state === "renamed" || state === "copied") {
    return "modified";
  }
  return null;
}

function mergeGitTones(current: GitTone | undefined, next: GitTone) {
  if (!current) return next;
  if (current === next) return current;
  return "mixed";
}

function buildGitDecorationMap(changes: GitChange[]) {
  const decorations = new Map<string, GitTone>();

  for (const change of changes) {
    const tone =
      getGitToneFromState(change.worktreeState) ??
      getGitToneFromState(change.indexState) ??
      "modified";
    let currentPath = normalizeTreePath(change.absolutePath);

    while (currentPath) {
      decorations.set(
        currentPath,
        mergeGitTones(decorations.get(currentPath), tone),
      );

      const nextPath = currentPath.split("/").slice(0, -1).join("/");
      if (nextPath === currentPath) break;
      currentPath = nextPath;
    }
  }

  return decorations;
}

function buildIgnoredPathSet(ignoredPaths: string[]) {
  return new Set(ignoredPaths.map(normalizeTreePath));
}

export default function ZenWorkspaceTreeModal({
  tree,
  folderPath,
  activeFile,
  gitChanges,
  ignoredPaths,
  loading,
  onClose,
  onFileSelect,
}: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [childrenByPath, setChildrenByPath] = useState<Map<string, FileNode[]>>(
    () => new Map(),
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const didSelectActiveRef = useRef(false);
  const userNavigatedRef = useRef(false);
  const childrenByPathRef = useRef<Map<string, FileNode[]>>(
    new Map(),
  );

  const rootPath = folderPath ?? tree?.path ?? null;
  const rootChildren = useMemo(
    () => sortChildren(tree?.children ?? []),
    [tree],
  );
  const rows = useMemo(
    () =>
      flattenRows(rootChildren, 0, expandedPaths, childrenByPath),
    [rootChildren, expandedPaths, childrenByPath],
  );
  const gitDecorations = useMemo(
    () => buildGitDecorationMap(gitChanges),
    [gitChanges],
  );
  const ignoredPathSet = useMemo(
    () => buildIgnoredPathSet(ignoredPaths),
    [ignoredPaths],
  );
  const activeIndex =
    rows.length === 0 ? 0 : Math.min(selectedIndex, rows.length - 1);
  const selectedRow = rows[activeIndex] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(
      () => listRef.current?.focus(),
      FOCUS_DELAY_MS,
    );

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!rootPath || !activeFile) return;

    const ancestors = getAncestorPaths(activeFile, rootPath);
    if (ancestors.length === 0) return;

    let cancelled = false;
    setExpandedPaths((current) => {
      if (ancestors.every((path) => current.has(path))) return current;

      const next = new Set(current);
      for (const path of ancestors) next.add(path);
      return next;
    });

    for (const path of ancestors) {
      if (
        childrenByPathRef.current.has(path) ||
        loadingRef.current.has(path)
      ) {
        continue;
      }

      loadingRef.current.add(path);
      setLoadingPaths((current) => new Set(current).add(path));

      void getTree(path, rootPath)
        .then((result) => {
          if (cancelled) return;

          const nextChildren = sortChildren(result.children ?? []);
          const nextMap = new Map(childrenByPathRef.current).set(
            path,
            nextChildren,
          );
          childrenByPathRef.current = nextMap;
          setChildrenByPath(nextMap);
        })
        .catch(() => {
          if (cancelled) return;

          const nextMap = new Map(childrenByPathRef.current).set(path, []);
          childrenByPathRef.current = nextMap;
          setChildrenByPath(nextMap);
        })
        .finally(() => {
          loadingRef.current.delete(path);
          if (cancelled) return;

          setLoadingPaths((current) => {
            const next = new Set(current);
            next.delete(path);
            return next;
          });
        });
    }

    return () => {
      cancelled = true;
    };
  }, [activeFile, rootPath]);

  useEffect(() => {
    if (
      didSelectActiveRef.current ||
      userNavigatedRef.current ||
      !activeFile
    ) {
      return;
    }

    const normalizedActiveFile = normalizeTreePath(activeFile);
    const index = rows.findIndex(
      (row) => normalizeTreePath(row.node.path) === normalizedActiveFile,
    );
    if (index < 0) return;

    didSelectActiveRef.current = true;
    setSelectedIndex(index);
  }, [activeFile, rows]);

  useEffect(() => {
    if (rows.length === 0) return;

    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-zen-tree-index="${activeIndex}"]`,
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, rows.length]);

  const loadChildren = (node: FileNode) => {
    if (
      !rootPath ||
      childrenByPathRef.current.has(node.path) ||
      loadingRef.current.has(node.path)
    ) {
      return;
    }

    loadingRef.current.add(node.path);
    setLoadingPaths((current) => new Set(current).add(node.path));

    void getTree(node.path, rootPath)
      .then((result) => {
        if (!mountedRef.current) return;

        const nextChildren = sortChildren(result.children ?? []);
        const nextMap = new Map(childrenByPathRef.current).set(
          node.path,
          nextChildren,
        );
        childrenByPathRef.current = nextMap;
        setChildrenByPath(nextMap);
      })
      .catch(() => {
        if (!mountedRef.current) return;

        const nextMap = new Map(childrenByPathRef.current).set(node.path, []);
        childrenByPathRef.current = nextMap;
        setChildrenByPath(nextMap);
      })
      .finally(() => {
        loadingRef.current.delete(node.path);
        if (!mountedRef.current) return;

        setLoadingPaths((current) => {
          const next = new Set(current);
          next.delete(node.path);
          return next;
        });
      });
  };

  const toggleFolder = (node: FileNode) => {
    if (!node.is_dir) return;

    if (expandedPaths.has(node.path)) {
      setExpandedPaths((current) => {
        const next = new Set(current);
        next.delete(node.path);
        return next;
      });
      return;
    }

    loadChildren(node);
    setExpandedPaths((current) => new Set(current).add(node.path));
  };

  const openNode = (node: FileNode) => {
    if (node.is_dir) {
      toggleFolder(node);
      return;
    }

    onFileSelect(node.path);
    onClose();
  };

  const handleRowClick = (index: number, node: FileNode) => {
    userNavigatedRef.current = true;
    listRef.current?.focus();
    setSelectedIndex(index);
    openNode(node);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedRow) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      userNavigatedRef.current = true;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSelectedIndex(
        Math.max(0, Math.min(rows.length - 1, activeIndex + delta)),
      );
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      userNavigatedRef.current = true;
      setSelectedIndex(event.key === "Home" ? 0 : rows.length - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      userNavigatedRef.current = true;
      if (!selectedRow.node.is_dir) return;

      if (!expandedPaths.has(selectedRow.node.path)) {
        toggleFolder(selectedRow.node);
        return;
      }

      const childIndex = rows.findIndex(
        (row, index) =>
          index > activeIndex && row.depth === selectedRow.depth + 1,
      );
      if (childIndex >= 0) setSelectedIndex(childIndex);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      userNavigatedRef.current = true;

      if (
        selectedRow.node.is_dir &&
        expandedPaths.has(selectedRow.node.path)
      ) {
        toggleFolder(selectedRow.node);
        return;
      }

      for (let index = activeIndex - 1; index >= 0; index -= 1) {
        if (rows[index].depth < selectedRow.depth) {
          setSelectedIndex(index);
          return;
        }
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openNode(selectedRow.node);
    }
  };

  return (
    <CommandModal
      title="Workspace tree"
      width={ZEN_TREE_MODAL_WIDTH}
      bodyClassName="min-h-0 overflow-hidden"
      onClose={onClose}
    >
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-2">
        <FolderTree
          size={12}
          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
        />
        <span className="min-w-0 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
          {rootPath ?? "No workspace open"}
        </span>
        <span className="ml-auto shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-40">
          read only
        </span>
      </div>

      <div
        ref={listRef}
        role="tree"
        tabIndex={0}
        aria-label="Workspace files"
        aria-activedescendant={
          selectedRow ? `zen-tree-row-${activeIndex}` : undefined
        }
        onKeyDown={handleKeyDown}
        className="max-h-[60vh] min-h-[8rem] overflow-auto py-1 outline-none"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <FolderOpen
              size={20}
              className="text-[var(--axon-editor-foreground)] opacity-25"
            />
            <p className="text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
              {loading
                ? "Loading workspace"
                : tree
                  ? "No files in this workspace"
                  : "No workspace open"}
            </p>
            <p className="text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
              {loading
                ? "Reading the active folder."
                : tree
                  ? "The active folder does not contain any files."
                  : "Open a folder to browse its files."}
            </p>
          </div>
        ) : (
          rows.map((row, index) => {
            const { node, depth } = row;
            const expanded = node.is_dir && expandedPaths.has(node.path);
            const isLoading = expanded && loadingPaths.has(node.path);
            const normalizedPath = normalizeTreePath(node.path);
            const gitTone = gitDecorations.get(normalizedPath);
            const ignored = ignoredPathSet.has(normalizedPath);
            const entryColor = gitTone
              ? GIT_TONE_COLORS[gitTone]
              : ignored
                ? IGNORED_ENTRY_COLOR
                : undefined;
            const active = index === activeIndex;

            return (
              <div
                key={node.path}
                id={`zen-tree-row-${index}`}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={active}
                aria-expanded={node.is_dir ? expanded : undefined}
                data-zen-tree-index={index}
                onClick={() => handleRowClick(index, node)}
                onMouseDown={(event) => event.preventDefault()}
                className={`relative flex min-w-full cursor-pointer select-none items-center gap-1.5 whitespace-nowrap py-1 pr-3 text-[12px] transition-colors ${
                  active
                    ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
                    : ignored
                      ? "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-80"
                      : "text-[var(--axon-editor-foreground)] opacity-72 hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
                }`}
                style={{
                  paddingLeft: `${TREE_BASE_INDENT + depth * TREE_DEPTH_WIDTH}px`,
                }}
              >
                <span className="flex h-4 w-3 shrink-0 items-center justify-center opacity-30">
                  {node.is_dir ? (
                    expanded ? (
                      <ChevronDown size={11} />
                    ) : (
                      <ChevronRight size={11} />
                    )
                  ) : null}
                </span>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center"
                  style={{ color: entryColor }}
                >
                  {node.is_dir
                    ? getFolderIcon(node.name, expanded)
                    : getFileIcon(node.name)}
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: entryColor }}
                >
                  {node.name}
                </span>
                {isLoading && (
                  <span className="ml-auto pl-3 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                    loading
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--axon-panel-border)] px-4 py-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
        <span>↑↓ navigate</span>
        <span>→ expand</span>
        <span>← collapse</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </CommandModal>
  );
}
