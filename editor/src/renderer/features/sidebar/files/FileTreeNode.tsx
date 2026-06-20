// Recursively renders a FileNode tree with drag and drop support.
// The core now returns only one directory level, so folders are expanded on
// demand here. That keeps workspace loads fast while still preserving the same
// nested tree interaction the user expects from an editor sidebar.
// Dragging over a folder highlights it and auto-expands it after a delay
// with a 3-blink animation before opening so the user sees clear feedback.
// Drop target shows a distinct highlight to confirm the landing zone.
import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { getTree, type FileNode } from "../../../shared/lib/api";
import {
  encodeFileTreeDragPayload,
  FILE_TREE_DRAG_TYPE,
} from "../../editor/lib/dragData";
import { getFileIcon, getFolderIcon } from "./lib/fileIcons";
import { type GitTreeDecoration } from "..";
import InlineCreateRow, {
  type InlineCreateTarget,
} from "./InlineCreateRow";
import {
  type FileTreeOperation,
  type ImportedExternalEntry,
} from "./FileTree";

interface Props {
  node: FileNode;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onMove: (sourcePath: string, targetDirPath: string) => void;
  onImportExternalEntries: (
    sourcePaths: string[],
    targetDirPath: string,
  ) => Promise<ImportedExternalEntry[]>;
  revealPath?: string | null;
  gitDecorations?: Map<string, GitTreeDecoration>;
  ignoredPaths?: Set<string>;
  inlineCreate?: InlineCreateTarget | null;
  operation?: FileTreeOperation | null;
  onInlineCreateCancel?: () => void;
  onInlineCreateCreated?: (path: string, isDir: boolean) => void | Promise<void>;
  depth?: number;
}

const TREE_BASE_INDENT = 8;
const TREE_DEPTH_WIDTH = 13;

function getParentPath(path: string) {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join(separator);
}

function getPathBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function sortTreeChildren(children: FileNode[]) {
  return [...children].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-y-0 left-0">
      {Array.from({ length: depth }).map((_, index) => (
        <span
          key={index}
          className="absolute top-0 bottom-0 w-px bg-[#222838]/70"
          style={{ left: `${TREE_BASE_INDENT + index * TREE_DEPTH_WIDTH}px` }}
        />
      ))}
    </span>
  );
}

const gitDecorationColors: Record<GitTreeDecoration["tone"], string> = {
  added: "#7ee787",
  modified: "#f2cc60",
  deleted: "#ff7b72",
  mixed: "#80c8e0",
};

function normalizeTreePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function renamePathPrefix(path: string, oldPath: string, newPath: string) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedOldPath = normalizeTreePath(oldPath);
  if (normalizedPath === normalizedOldPath) return newPath;
  if (!normalizedPath.startsWith(`${normalizedOldPath}/`)) return path;
  return `${newPath}${path.slice(oldPath.length)}`;
}

function renameTreeNodePath(
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
      renameTreeNodePath(child, oldPath, newPath),
    ),
  };
}

function isIgnoredTreePath(path: string, ignoredPaths?: Set<string>) {
  if (!ignoredPaths || ignoredPaths.size === 0) return false;

  const normalizedPath = normalizeTreePath(path);
  if (ignoredPaths.has(normalizedPath)) return true;

  // Git reports ignored directories as the directory path, not every child
  // inside that directory. Checking parent prefixes lets node_modules/foo.js
  // inherit the muted ignored tone from node_modules without asking Git for an
  // enormous file-by-file ignored listing.
  for (const ignoredPath of ignoredPaths) {
    if (normalizedPath.startsWith(`${ignoredPath}/`)) return true;
  }

  return false;
}

function getExternalDropPaths(dataTransfer: DataTransfer) {
  return window.axon.getDroppedFilePaths(Array.from(dataTransfer.files));
}

function hasExternalFileDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

export default function FileTreeNode({
  node,
  activeFile,
  onFileSelect,
  onContextMenu,
  onMove,
  onImportExternalEntries,
  revealPath,
  gitDecorations,
  ignoredPaths,
  inlineCreate,
  operation,
  onInlineCreateCancel,
  onInlineCreateCreated,
  depth = 0,
}: Props) {
  // Folder nodes should start collapsed unless the user expands them or a
  // reveal path tells us to open them. The old default opened every first
  // level folder as soon as a workspace was loaded, which made new workspaces
  // look like the tree had auto-expanded on fetch.
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [children, setChildren] = useState<FileNode[] | undefined>(
    node.children,
  );

  const dragCounter = useRef(0);

  // holds the auto-expand timer so we can cancel it if the drag leaves
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // holds the blink interval so we can stop it on drag leave
  const blinkInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkCount = useRef(0);

  const clearTimers = () => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
    if (blinkInterval.current) {
      clearInterval(blinkInterval.current);
      blinkInterval.current = null;
    }
    blinkCount.current = 0;
    setBlinking(false);
  };

  // cleanup timers on unmount
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    // I keep the local child cache in sync with the latest node payload so a
    // refresh or rename does not leave the sidebar pointing at stale children.
    // When the core returns a shallow node with no children yet, the cache stays
    // undefined until the folder is actually expanded and fetched on demand.
    setChildren(node.children);
  }, [node.children, node.path]);

  useEffect(() => {
    if (revealPath && node.is_dir && revealPath.startsWith(`${node.path}/`)) {
      setExpanded(true);
    }
  }, [node.is_dir, node.path, revealPath]);

  useEffect(() => {
    if (node.is_dir && inlineCreate?.parentPath === node.path) {
      setExpanded(true);
    }
  }, [inlineCreate?.parentPath, node.is_dir, node.path]);

  useEffect(() => {
    if (!node.is_dir || !expanded || children !== undefined) return;

    let cancelled = false;
    getTree(node.path)
      .then((tree) => {
        if (cancelled) return;
        setChildren(tree.children ?? []);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      });

    return () => {
      cancelled = true;
    };
  }, [children, expanded, node.is_dir, node.path]);

  useEffect(() => {
    if (!operation || !node.is_dir) return;

    setChildren((currentChildren) => {
      if (!currentChildren) return currentChildren;

      if (operation.type === "created") {
        if (
          normalizeTreePath(getParentPath(operation.path)) !==
          normalizeTreePath(node.path)
        ) {
          return currentChildren;
        }
        if (
          currentChildren.some(
            (child) =>
              normalizeTreePath(child.path) === normalizeTreePath(operation.path),
          )
        ) {
          return currentChildren;
        }

        return sortTreeChildren([
          ...currentChildren,
          {
            name: getPathBasename(operation.path),
            path: operation.path,
            is_dir: operation.isDir,
            children: operation.isDir ? [] : undefined,
          },
        ]);
      }

      if (operation.type === "deleted") {
        return currentChildren.filter((child) => {
          const childPath = normalizeTreePath(child.path);
          const deletedPath = normalizeTreePath(operation.path);
          return (
            childPath !== deletedPath && !childPath.startsWith(`${deletedPath}/`)
          );
        });
      }

      if (operation.type === "renamed" || operation.type === "moved") {
        return sortTreeChildren(
          currentChildren.map((child) =>
            renameTreeNodePath(child, operation.oldPath, operation.newPath),
          ),
        );
      }

      return currentChildren;
    });
  }, [node.is_dir, node.path, operation]);

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.setData(
      FILE_TREE_DRAG_TYPE,
      encodeFileTreeDragPayload({
        path: node.path,
        isDir: node.is_dir,
      }),
    );
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;

    if (dragCounter.current === 1) {
      setDragOver(true);

      if (node.is_dir && !expanded) {
        // start blinking after 400ms of hovering, then expand after 3 blinks
        expandTimer.current = setTimeout(() => {
          blinkCount.current = 0;
          setBlinking(true);

          // blink 3 times at 200ms intervals then expand
          blinkInterval.current = setInterval(() => {
            blinkCount.current++;
            if (blinkCount.current >= 6) {
              clearTimers();
              setExpanded(true);
            }
          }, 150);
        }, 600);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    dragCounter.current--;

    if (dragCounter.current === 0) {
      setDragOver(false);
      clearTimers();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect =
      hasExternalFileDrag(e.dataTransfer) ? "copy" : "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    clearTimers();

    const targetDir = node.is_dir
      ? node.path
      : node.path.split("/").slice(0, -1).join("/");
    const externalPaths = getExternalDropPaths(e.dataTransfer);
    if (externalPaths.length > 0) {
      void handleExternalImportDrop(externalPaths, targetDir);
      return;
    }

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === node.path) return;

    onMove(sourcePath, targetDir);
  };

  const insertImportedChildren = (importedEntries: ImportedExternalEntry[]) => {
    if (!node.is_dir) return;

    const directChildren = importedEntries.filter(
      (entry) =>
        normalizeTreePath(getParentPath(entry.targetPath)) ===
        normalizeTreePath(node.path),
    );
    if (directChildren.length === 0) return;

    setChildren((currentChildren) => {
      const existingChildren = currentChildren ?? [];
      const nextChildren = [...existingChildren];
      for (const entry of directChildren) {
        if (
          nextChildren.some(
            (child) =>
              normalizeTreePath(child.path) ===
              normalizeTreePath(entry.targetPath),
          )
        ) {
          continue;
        }

        nextChildren.push({
          name: getPathBasename(entry.targetPath),
          path: entry.targetPath,
          is_dir: entry.isDir,
          children: entry.isDir ? [] : undefined,
        });
      }

      return sortTreeChildren(nextChildren);
    });
    setExpanded(true);
  };

  const handleExternalImportDrop = async (
    externalPaths: string[],
    targetDir: string,
  ) => {
    const importedEntries = await onImportExternalEntries(
      externalPaths,
      targetDir,
    );
    insertImportedChildren(importedEntries);
  };

  const handleInlineCreateCreated = async (
    createdPath: string,
    isDir: boolean,
  ) => {
    if (node.is_dir && normalizeTreePath(getParentPath(createdPath)) === normalizeTreePath(node.path)) {
      // Expanded folders keep their own lazy child cache, so a root-level tree
      // refresh alone is not enough to reveal a newly created nested entry.
      // I insert the node into this folder's local cache immediately, then let
      // the parent sidebar refresh reconcile the full tree and Git status.
      setChildren((currentChildren) => {
        const existingChildren = currentChildren ?? [];
        if (
          existingChildren.some(
            (child) => normalizeTreePath(child.path) === normalizeTreePath(createdPath),
          )
        ) {
          return existingChildren;
        }

        return sortTreeChildren([
          ...existingChildren,
          {
            name: getPathBasename(createdPath),
            path: createdPath,
            is_dir: isDir,
            children: isDir ? [] : undefined,
          },
        ]);
      });
      setExpanded(true);
    }

    await onInlineCreateCreated?.(createdPath, isDir);
  };

  // blink alternates between the highlight and normal state
  // blinkCount goes 0-5 (6 ticks) — odd ticks dim, even ticks highlight
  const isBlinkOn = blinking && blinkCount.current % 2 === 0;
  const rowPaddingLeft = TREE_BASE_INDENT + depth * TREE_DEPTH_WIDTH;
  const gitDecoration = gitDecorations?.get(normalizeTreePath(node.path));
  const ignored = isIgnoredTreePath(node.path, ignoredPaths);
  const gitColor = gitDecoration
    ? gitDecorationColors[gitDecoration.tone]
    : undefined;
  const entryColor = ignored && !gitDecoration ? "#4b5568" : undefined;

  if (node.is_dir) {
    const isHighlighted = dragOver || isBlinkOn;

    const renderedChildren = children ?? [];

    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          onClick={() => setExpanded((p) => !p)}
          onContextMenu={(e) => onContextMenu(e, node)}
          className={`flex items-center gap-1.5 py-0.5 text-[12px] cursor-pointer transition-colors select-none relative
            ${
              isHighlighted
                ? "text-white"
                : ignored
                  ? "text-[#4b5568] hover:bg-[#151923] hover:text-[#647086]"
                  : "text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white"
            }`}
          style={{
            paddingLeft: `${rowPaddingLeft}px`,
            // use inline style for the highlight so the blink transition is smooth
            backgroundColor: isHighlighted ? "#1e2430" : undefined,
            // cyan left border when dragging over to make the drop zone very obvious
            borderLeft: dragOver
              ? "2px solid #80c8e0"
              : "2px solid transparent",
            transition: "background-color 100ms, border-color 100ms",
          }}
        >
          <TreeGuides depth={depth} />
          <span className="relative z-10 flex h-4 w-3 items-center justify-center text-[#364050]">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <span
            className="relative z-10 flex h-4 w-4 items-center justify-center"
            style={{ color: entryColor }}
          >
            {getFolderIcon(node.name, expanded)}
          </span>
          <span className="relative z-10 truncate" style={{ color: entryColor }}>
            {node.name}
          </span>

          {dragOver && (
            <span className="relative z-10 ml-auto mr-2 text-[10px] text-[#80c8e0] shrink-0">
              drop here
            </span>
          )}
          {!dragOver && gitDecoration && (
            <span className="relative z-10 ml-auto mr-2 flex shrink-0 items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: gitColor }}
              />
              <span
                className="text-[9px] font-medium"
                style={{ color: gitColor }}
              >
                {gitDecoration.label}
              </span>
            </span>
          )}
        </div>

        {expanded && inlineCreate?.parentPath === node.path && (
          <InlineCreateRow
            target={inlineCreate}
            depth={depth + 1}
            onCancel={onInlineCreateCancel ?? (() => undefined)}
            onCreated={handleInlineCreateCreated}
          />
        )}

        {expanded &&
          renderedChildren.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
              onMove={onMove}
              onImportExternalEntries={onImportExternalEntries}
              revealPath={revealPath}
              gitDecorations={gitDecorations}
              ignoredPaths={ignoredPaths}
              inlineCreate={inlineCreate}
              operation={operation}
              onInlineCreateCancel={onInlineCreateCancel}
              onInlineCreateCreated={onInlineCreateCreated}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => onFileSelect(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
      className={`relative flex items-center gap-1.5 py-1 text-[12px] cursor-pointer transition-colors truncate
        ${
          activeFile === node.path
            ? "bg-[#171a24] text-white"
            : ignored
              ? "text-[#4b5568] hover:bg-[#151923] hover:text-[#647086]"
              : "text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white"
        }`}
      style={{
        paddingLeft: `${rowPaddingLeft}px`,
        // cyan left border when this file is a drop target
        borderLeft: dragOver ? "2px solid #80c8e0" : "2px solid transparent",
        transition: "border-color 100ms",
      }}
    >
      <TreeGuides depth={depth} />
      <span className="relative z-10 flex w-3 shrink-0" />
      <span
        className="relative z-10 flex h-4 w-4 items-center justify-center"
        style={{ color: entryColor }}
      >
        {getFileIcon(node.name)}
      </span>
      <span className="relative z-10 truncate" style={{ color: entryColor }}>
        {node.name}
      </span>
      {gitDecoration && (
        <span className="relative z-10 ml-auto mr-2 flex shrink-0 items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: gitColor }}
          />
          <span className="text-[9px] font-medium" style={{ color: gitColor }}>
            {gitDecoration.label}
          </span>
        </span>
      )}
    </div>
  );
}
