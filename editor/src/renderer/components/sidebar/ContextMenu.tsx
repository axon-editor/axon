// Floating context menu for file and folder operations.
// Creation is started from here, but the actual input is rendered in the
// sidebar tree. That matches editor behavior users expect: the new entry
// appears exactly where it will be created, and clicking away can either save
// a typed name or cancel an empty one.
import { useEffect, useRef, useState } from "react";
import {
  Columns2,
  Copy,
  FilePlus,
  FolderPlus,
  MonitorPlay,
  Pencil,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import {
  type FileNode,
  deleteEntry,
  renameEntry,
} from "../../lib/api";
import { isHtmlFile } from "../../lib/htmlPreviewTabs";
import { type InlineCreateKind } from "./InlineCreateRow";

interface Props {
  menu: { x: number; y: number; node: FileNode; isRoot?: boolean };
  existingNames: string[];
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenPath?: (path: string, isDir: boolean) => void;
  onBeginCreate?: (parentPath: string, kind: InlineCreateKind) => void;
  onEntryDeleted?: (path: string) => void;
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  onSplitFile?: (filePath: string) => void;
  onOpenInTerminal?: (path: string) => void;
  onOpenHtmlPreview?: (filePath: string) => void;
}

export default function ContextMenu({
  menu,
  existingNames,
  onClose,
  onRefresh,
  onOpenPath,
  onBeginCreate,
  onEntryDeleted,
  onEntryRenamed,
  onSplitFile,
  onOpenInTerminal,
  onOpenHtmlPreview,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"menu" | "rename" | "delete">("menu");
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (mode === "rename") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const getParentPath = (path: string) => {
    const separator = path.includes("\\") ? "\\" : "/";
    const parts = path.split(/[\\/]/);
    parts.pop();
    return parts.join(separator);
  };

  const joinPath = (parentPath: string, name: string) => {
    const separator = parentPath.includes("\\") ? "\\" : "/";
    return `${parentPath.replace(/[\\/]+$/, "")}${separator}${name}`;
  };

  const basePath = menu.node.is_dir
    ? menu.node.path
    : getParentPath(menu.node.path);
  const canPreviewHtml = !menu.node.is_dir && isHtmlFile(menu.node.path);

  const trimmedName = inputValue.trim();
  const isDuplicateName =
    !!trimmedName &&
    existingNames.some(
      (name) =>
        name === trimmedName &&
        (mode !== "rename" || trimmedName !== menu.node.name),
    );

  const beginRename = () => {
    setInputValue(menu.node.name);
    setMode("rename");
  };

  const handleConfirmRename = async () => {
    const name = trimmedName;
    if (!name || isDuplicateName || menu.isRoot) return;

    const renamedPath = await renameEntry(menu.node.path, name);
    onEntryRenamed?.(menu.node.path, renamedPath);
    await onRefresh();
    onOpenPath?.(renamedPath, menu.node.is_dir);
    onClose();
  };

  const handleDelete = async () => {
    await deleteEntry(menu.node.path);
    onEntryDeleted?.(menu.node.path);
    await onRefresh();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (mode === "rename") void handleConfirmRename();
    }
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      ref={ref}
      className="axon-context-menu fixed z-50 min-w-52 overflow-hidden rounded-md border border-[#293144] bg-[#0f121a] py-1 shadow-[0_18px_54px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.03]"
      style={{ top: menu.y, left: menu.x }}
    >
      {mode === "menu" && (
        <div className="axon-context-menu__panel">
          <button
            onClick={() => {
              onBeginCreate?.(basePath, "file");
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
          >
            <FilePlus size={13} className="text-[#80c8e0]" />
            new file
          </button>
          <button
            onClick={() => {
              onBeginCreate?.(basePath, "folder");
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
          >
            <FolderPlus size={13} className="text-[#80c8e0]" />
            new folder
          </button>
          <div className="my-1 border-t border-[#222838]" />
          {onOpenInTerminal && (
            <button
              onClick={() => {
                onOpenInTerminal(basePath);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
            >
              <TerminalIcon size={13} className="text-[#9aa4b8]" />
              open in terminal
            </button>
          )}
          {onOpenHtmlPreview && canPreviewHtml && (
            <button
              onClick={() => {
                onOpenHtmlPreview(menu.node.path);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
            >
              <MonitorPlay size={13} className="text-[#9aa4b8]" />
              preview html
            </button>
          )}
          <button
            onClick={() => {
              void window.axon.copyText(menu.node.path);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
          >
            <Copy size={13} className="text-[#9aa4b8]" />
            copy path
          </button>
          {!menu.isRoot && (
            <button
              onClick={beginRename}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
            >
              <Pencil size={13} className="text-[#9aa4b8]" />
              rename
            </button>
          )}
          <div className="my-1 border-t border-[#222838]" />
          {!menu.isRoot && (
            <button
              onClick={() => setMode("delete")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400 hover:bg-[#241820] hover:text-red-300 transition-all duration-150 cursor-pointer"
            >
              <Trash2 size={13} />
              delete
            </button>
          )}
        </div>
      )}

      {mode === "rename" && (
        <div className="axon-context-menu__panel px-3 py-3 flex flex-col gap-2.5">
          <span className="text-[11px] uppercase tracking-normal text-[#586478]">
            new name
          </span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`h-8 bg-[#090b11] border rounded px-2 text-[12px] text-white outline-none w-full transition-colors ${
              isDuplicateName
                ? "border-red-500 focus:border-red-400"
                : "border-[#222838] focus:border-[#80c8e0]"
            }`}
            placeholder={
              menu.node.name
            }
          />
          {isDuplicateName && (
            <span className="text-[11px] text-red-400">
              {trimmedName} already exists
            </span>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-7 px-2 text-[11px] text-[#586478] hover:text-white cursor-pointer transition-colors"
            >
              cancel
            </button>
            <button
              onClick={() => void handleConfirmRename()}
              disabled={!trimmedName || isDuplicateName}
              className="h-7 px-3 rounded bg-[#80c8e0] text-[11px] font-medium text-[#0e1018] hover:bg-[#9dd4e8] cursor-pointer disabled:cursor-default disabled:opacity-50 transition-colors"
            >
              rename
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="axon-context-menu__panel px-3 py-3 flex flex-col gap-3">
          <span className="text-[11px] text-[#9aa4b8]">
            delete <span className="text-white">{menu.node.name}</span>?
          </span>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-7 px-2 text-[11px] text-[#586478] hover:text-white cursor-pointer transition-colors"
            >
              cancel
            </button>
            <button
              onClick={handleDelete}
              className="h-7 px-3 rounded bg-red-500 text-[11px] text-white hover:bg-red-400 cursor-pointer transition-colors"
            >
              delete
            </button>
          </div>
        </div>
      )}

      {onSplitFile && !menu.node.is_dir && (
        <>
          <div className="my-1 border-t border-[#222838]" />
          <button
            onClick={() => {
              onSplitFile(menu.node.path);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#c8d0e0] hover:bg-[#1a2030] hover:text-white transition-all duration-150 cursor-pointer"
          >
            <Columns2 size={13} className="text-[#9aa4b8]" />
            split right
          </button>
        </>
      )}
    </div>
  );
}
