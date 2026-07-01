// Modal that shows recent folders and lets the user open a new one.
// Recent folders are persisted in localStorage keyed by axon:recentFolders.
// Clicking a recent folder opens it directly.
// Clicking "open folder" triggers the native folder picker.
// Closes on outside click or Escape.
import { Clock, FolderOpen, Trash2, X } from "lucide-react";
import CommandModal from "../../../shared/components/CommandModal";
import { type WorkspaceRoot } from "../../../shared/lib/workspaceRoots";

interface Props {
  recentFolders: string[];
  workspaceRoots?: WorkspaceRoot[];
  activeRootId?: string | null;
  onSelect: (path: string) => void;
  onSelectWorkspaceRoot?: (path: string) => void;
  onOpenNew: () => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onClearSession: () => void;
  onClose: () => void;
}

export default function FolderPicker({
  recentFolders,
  workspaceRoots = [],
  activeRootId = null,
  onSelect,
  onSelectWorkspaceRoot,
  onOpenNew,
  onRemoveRecent,
  onClearRecent,
  onClearSession,
  onClose,
}: Props) {
  const openNativeFolderPicker = () => {
    onClose();

    // The native folder dialog is outside React, so keeping Axon's picker
    // mounted while Electron starts that dialog only adds an extra overlay and
    // animation frame to the slowest path. Closing first keeps the renderer
    // idle before the OS sheet appears and prevents the picker from feeling
    // sticky on slower machines.
    window.requestAnimationFrame(() => {
      onOpenNew();
    });
  };

  return (
    <CommandModal
      title="open folder"
      onClose={onClose}
      width="w-[480px]"
      blurOverlay={false}
      animate={false}
      closeDelayMs={0}
      overlayClassName="bg-transparent"
    >
      <div className="p-2">
        <button
          onClick={openNativeFolderPicker}
          className="flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2.5 text-[12px] text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-sidebar-hover-background)]"
        >
          <FolderOpen size={14} className="shrink-0" />
          <span>browse for folder...</span>
        </button>

        {workspaceRoots.length > 0 && (
          <>
            <div className="mt-1 flex items-center gap-2 px-3 py-2">
              <FolderOpen
                size={11}
                className="text-[var(--axon-editor-foreground)] opacity-45"
              />
              <span className="text-[10px] uppercase tracking-widest text-[var(--axon-editor-foreground)] opacity-45">
                workspace roots
              </span>
            </div>
            {workspaceRoots.map((root) => {
              const parent = root.path.split(/[\\/]/).slice(0, -1).join("/");
              const active = root.id === activeRootId;
              return (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => {
                    onSelectWorkspaceRoot?.(root.path);
                    onClose();
                  }}
                  className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
                      : "text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-sidebar-hover-background)]"
                  }`}
                >
                  <FolderOpen
                    size={14}
                    className={`shrink-0 ${active ? "text-[var(--axon-syntax-function)]" : "text-[var(--axon-editor-foreground)] opacity-55"}`}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[12px]">{root.name}</span>
                    <span className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
                      {parent}
                    </span>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {recentFolders.length > 0 && (
          <>
            <div className="mt-1 flex items-center gap-2 px-3 py-2">
              <Clock
                size={11}
                className="text-[var(--axon-editor-foreground)] opacity-45"
              />
              <span className="text-[10px] uppercase tracking-widest text-[var(--axon-editor-foreground)] opacity-45">
                recent
              </span>
              <button
                type="button"
                onClick={onClearRecent}
                className="ml-auto flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#ff7b72] hover:opacity-100"
              >
                <Trash2 size={11} />
                clear
              </button>
            </div>
            {recentFolders.map((folder) => {
              const parts = folder.split("/");
              const name = parts[parts.length - 1];
              const parent = parts.slice(0, -1).join("/");
              return (
                <div
                  key={folder}
                  className="group flex w-full items-center gap-2 rounded px-1 transition-colors hover:bg-[var(--axon-sidebar-hover-background)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(folder);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-2 text-left"
                  >
                    <FolderOpen
                      size={14}
                      className="shrink-0 text-[var(--axon-editor-foreground)] opacity-55 transition-colors group-hover:text-[var(--axon-syntax-function)] group-hover:opacity-100"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                        {name}
                      </span>
                      <span className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                        {parent}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveRecent(folder)}
                    aria-label={`Remove ${name} from recent folders`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 transition-all hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#ff7b72] group-hover:opacity-55"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </>
        )}

        {recentFolders.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            no recent folders
          </div>
        )}

        <div className="mt-2 border-t border-[var(--axon-panel-border)] pt-2">
          <button
            type="button"
            onClick={onClearSession}
            className="flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2 text-left text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
          >
            <Trash2
              size={13}
              className="shrink-0 text-[var(--axon-editor-foreground)] opacity-55"
            />
            <span>clear saved workspace session</span>
          </button>
        </div>
      </div>
    </CommandModal>
  );
}
