// Recursively renders a FileNode tree with drag and drop support.
// Dragging over a folder highlights it and auto-expands it after a delay
// with a 3-blink animation before opening so the user sees clear feedback.
// Drop target shows a distinct highlight to confirm the landing zone.
import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { type FileNode } from "../../lib/api";
import {
  encodeFileTreeDragPayload,
  FILE_TREE_DRAG_TYPE,
} from "../../lib/dragData";
import { getFileIcon, getFolderIcon } from "../../lib/fileIcons";

interface Props {
  node: FileNode;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onMove: (sourcePath: string, targetDirPath: string) => void;
  revealPath?: string | null;
  depth?: number;
}

const TREE_BASE_INDENT = 8;
const TREE_DEPTH_WIDTH = 13;

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

export default function FileTreeNode({
  node,
  activeFile,
  onFileSelect,
  onContextMenu,
  onMove,
  revealPath,
  depth = 0,
}: Props) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [dragOver, setDragOver] = useState(false);
  const [blinking, setBlinking] = useState(false);

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
    if (revealPath && node.is_dir && revealPath.startsWith(`${node.path}/`)) {
      setExpanded(true);
    }
  }, [node.is_dir, node.path, revealPath]);

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
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    clearTimers();

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === node.path) return;

    const targetDir = node.is_dir
      ? node.path
      : node.path.split("/").slice(0, -1).join("/");

    onMove(sourcePath, targetDir);
  };

  // blink alternates between the highlight and normal state
  // blinkCount goes 0-5 (6 ticks) — odd ticks dim, even ticks highlight
  const isBlinkOn = blinking && blinkCount.current % 2 === 0;
  const rowPaddingLeft = TREE_BASE_INDENT + depth * TREE_DEPTH_WIDTH;

  if (node.is_dir) {
    const isHighlighted = dragOver || isBlinkOn;

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
          <span className="relative z-10 flex items-center">
            {getFolderIcon(node.name, expanded)}
          </span>
          <span className="relative z-10 truncate">{node.name}</span>

          {dragOver && (
            <span className="relative z-10 ml-auto mr-2 text-[10px] text-[#80c8e0] shrink-0">
              drop here
            </span>
          )}
        </div>

        {expanded &&
          node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
              onMove={onMove}
              revealPath={revealPath}
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
      <span className="relative z-10 flex items-center">
        {getFileIcon(node.name)}
      </span>
      <span className="relative z-10 truncate">{node.name}</span>
    </div>
  );
}
