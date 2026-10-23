/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Cmd+B in zen opens this read-only tree instead of widening the sidebar back
// into the canvas. The hook keeps the sidebar's lazy getTree expansion and git
// tone paint, but leaves rename, drag, and context-menu operations behind so
// the modal stays a navigation surface.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { getTree, type FileNode } from "@axon-editor/renderer/shared/lib/backend/api";
import type { GitChange } from "@axon-editor/shared/workspace/git";
import { buildGitDecorationMap, buildIgnoredPathSet } from "../../shared/zenTreeGit";
import { getAncestorPaths, normalizeTreePath } from "../../shared/zenTreePath";
import { flattenRows, sortChildren } from "../rows/zenTreeRows";

interface Options {
  tree: FileNode | null;
  folderPath: string | null;
  activeFile: string | null;
  gitChanges: GitChange[];
  ignoredPaths: string[];
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

export function useZenWorkspaceTree({
  tree,
  folderPath,
  activeFile,
  gitChanges,
  ignoredPaths,
  onFileSelect,
  onClose,
}: Options) {
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
  const childrenByPathRef = useRef<Map<string, FileNode[]>>(new Map());

  const rootPath = folderPath ?? tree?.path ?? null;
  const rootChildren = useMemo(
    () => sortChildren(tree?.children ?? []),
    [tree],
  );
  const rows = useMemo(
    () => flattenRows(rootChildren, 0, expandedPaths, childrenByPath),
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
    return () => {
      mountedRef.current = false;
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

  const focusList = () => listRef.current?.focus();

  const openSelected = () => {
    if (selectedRow) openNode(selectedRow.node);
  };

  return {
    rootPath,
    rows,
    expandedPaths,
    loadingPaths,
    gitDecorations,
    ignoredPathSet,
    activeIndex,
    selectedRow,
    listRef,
    setSelectedIndex,
    focusList,
    handleKeyDown,
    handleRowClick,
    openSelected,
  };
}
