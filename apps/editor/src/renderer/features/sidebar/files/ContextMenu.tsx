// Floating context menu for file and folder operations.
// Creation is started from here, but the actual input is rendered in the
// sidebar tree. That matches editor behavior users expect: the new entry
// appears exactly where it will be created, and clicking away can either save
// a typed name or cancel an empty one.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
} from "../../../shared/lib/api";
import { isHtmlFile } from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import { type InlineCreateKind } from "./InlineCreateRow";

interface Props {
  menu: { x: number; y: number; node: FileNode; isRoot?: boolean };
  rootPath: string;
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
  rootPath,
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
  const [position, setPosition] = useState({ x: menu.x, y: menu.y });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const padding = 8;
    const nextX = Math.min(
      Math.max(menu.x, padding),
      window.innerWidth - rect.width - padding,
    );
    const nextY = Math.min(
      Math.max(menu.y, padding),
      window.innerHeight - rect.height - padding,
    );
    setPosition({ x: nextX, y: nextY });
  }, [menu.x, menu.y, mode]);

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
  const itemClassName =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-75 transition-all duration-150 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100";
  const destructiveItemClassName =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[var(--axon-danger-foreground)] text-[12px] transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--axon-danger-foreground)_14%,transparent)] hover:text-[var(--axon-danger-foreground)]";
  const dividerClassName = "my-1 border-t border-[var(--axon-panel-border)]";
  const mutedIconClassName = "text-[var(--axon-editor-foreground)] opacity-55";
  const accentIconClassName = "text-[var(--axon-syntax-function)]";

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
    await deleteEntry(menu.node.path, rootPath);
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
      className="axon-context-menu fixed z-50 min-w-56 origin-top-left overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-1.5 text-[var(--axon-editor-foreground)] opacity-100 shadow-[0_18px_54px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.03] animate-[axonContextIn_120ms_ease-out]"
      style={{
        top: position.y,
        left: position.x,
        // The menu is mounted directly under the renderer document instead of
        // inside the sidebar tree. Keeping every color on shared theme tokens
        // makes the menu follow Ayu, One, and downloaded themes without needing
        // a separate sidebar-specific palette for floating UI.
        backdropFilter: "blur(12px)",
      }}
    >
      {mode === "menu" && (
        <div className="axon-context-menu__panel space-y-0.5">
          <button
            onClick={() => {
              onBeginCreate?.(basePath, "file");
              onClose();
            }}
            className={itemClassName}
          >
            <FilePlus size={13} className={accentIconClassName} />
            new file
          </button>
          <button
            onClick={() => {
              onBeginCreate?.(basePath, "folder");
              onClose();
            }}
            className={itemClassName}
          >
            <FolderPlus size={13} className={accentIconClassName} />
            new folder
          </button>
          <div className={dividerClassName} />
          {onOpenInTerminal && (
            <button
              onClick={() => {
                onOpenInTerminal(basePath);
                onClose();
              }}
              className={itemClassName}
            >
              <TerminalIcon size={13} className={mutedIconClassName} />
              open in terminal
            </button>
          )}
          {onOpenHtmlPreview && canPreviewHtml && (
            <button
              onClick={() => {
                onOpenHtmlPreview(menu.node.path);
                onClose();
              }}
              className={itemClassName}
            >
              <MonitorPlay size={13} className={mutedIconClassName} />
              preview html
            </button>
          )}
          <button
            onClick={() => {
              void window.axon.copyText(menu.node.path);
              onClose();
            }}
            className={itemClassName}
          >
            <Copy size={13} className={mutedIconClassName} />
            copy path
          </button>
          {!menu.isRoot && (
            <button
              onClick={beginRename}
              className={itemClassName}
            >
              <Pencil size={13} className={mutedIconClassName} />
              rename
            </button>
          )}
          {onSplitFile && !menu.node.is_dir && (
            <>
              <div className={dividerClassName} />
              <button
                onClick={() => {
                  onSplitFile(menu.node.path);
                  onClose();
                }}
                className={itemClassName}
              >
                <Columns2 size={13} className={mutedIconClassName} />
                split right
              </button>
            </>
          )}
          <div className={dividerClassName} />
          {!menu.isRoot && (
            <button
              onClick={() => setMode("delete")}
              className={destructiveItemClassName}
            >
              <Trash2 size={13} />
              delete
            </button>
          )}
        </div>
      )}

      {mode === "rename" && (
        <div className="axon-context-menu__panel px-3 py-3 flex flex-col gap-2.5">
          <span className="text-[11px] uppercase tracking-normal text-[var(--axon-editor-foreground)] opacity-45">
            new name
          </span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`h-8 w-full rounded border bg-[var(--axon-editor-background)] px-2 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors ${
              isDuplicateName
                ? "border-red-500 focus:border-red-400"
                : "border-[var(--axon-panel-border)] focus:border-[var(--axon-syntax-function)]"
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
              className="h-7 cursor-pointer px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:opacity-100"
            >
              cancel
            </button>
            <button
              onClick={() => void handleConfirmRename()}
              disabled={!trimmedName || isDuplicateName}
              className="h-7 cursor-pointer rounded border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[11px] font-medium text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-default disabled:border-[var(--axon-panel-border)] disabled:opacity-50"
            >
              rename
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="axon-context-menu__panel px-3 py-3 flex flex-col gap-3">
          <span className="text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
            delete <span className="font-medium text-[var(--axon-editor-foreground)] opacity-100">{menu.node.name}</span>?
          </span>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-7 cursor-pointer px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:opacity-100"
            >
              cancel
            </button>
            <button
              onClick={handleDelete}
              className="h-7 cursor-pointer rounded border border-[var(--axon-danger-foreground)] bg-[color-mix(in_srgb,var(--axon-danger-foreground)_18%,transparent)] px-3 text-[11px] text-[var(--axon-danger-foreground)] transition-colors hover:bg-[color-mix(in_srgb,var(--axon-danger-foreground)_26%,transparent)]"
            >
              delete
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
