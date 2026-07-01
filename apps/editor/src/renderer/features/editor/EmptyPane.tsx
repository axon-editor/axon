// Welcome screen shown when a pane has no open files.
// Shows the Axon logo, quick action buttons, and recent folders.
import { FolderOpen, FilePlus, Clock, ChevronRight, X } from "lucide-react";
import { publicAsset } from "../../shared/lib/assets";
import { getRecentFolders } from "../sidebar";
import Tooltip from "../../shared/components/Tooltip";

interface Props {
  onOpenFolder: () => void;
  onNewFile: () => void;
  onSelectRecentFolder: (path: string) => void;
  onClosePane?: () => void;
}

export default function EmptyPane({
  onOpenFolder,
  onNewFile,
  onSelectRecentFolder,
  onClosePane,
}: Props) {
  const recentFolders = getRecentFolders().slice(0, 5);

  return (
    <div className="relative flex h-full select-none flex-col items-center justify-center bg-[var(--axon-editor-background)] px-8">
      {onClosePane ? (
        <Tooltip label="Close empty pane" side="left">
          <button
            type="button"
            onClick={onClosePane}
            aria-label="Close empty pane"
            className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-35 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={13} />
          </button>
        </Tooltip>
      ) : null}
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <img
            src={publicAsset("axon.png")}
            alt="Axon"
            className="mb-1 h-22 w-22 opacity-80"
            draggable={false}
          />
          <span className="text-[15px] font-semibold tracking-wide text-[var(--axon-editor-foreground)]">
            Axon
          </span>
          <span className="text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
            your editor, your rules
          </span>
          <div className="my-1 w-full border-t border-[var(--axon-panel-border)]" />
          <span className="max-w-65 text-center text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-35">
            Open a file, split from the sidebar, or drop a file or tab here.
          </span>
        </div>

        <div className="flex w-full gap-2">
          <button
            onClick={onOpenFolder}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 py-2.5 text-[12px] text-[var(--axon-editor-foreground)] opacity-75 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <FolderOpen size={13} className="shrink-0" />
            open folder
          </button>
          <button
            onClick={onNewFile}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 py-2.5 text-[12px] text-[var(--axon-editor-foreground)] opacity-75 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <FilePlus size={13} className="shrink-0" />
            new file
          </button>
        </div>

        {recentFolders.length > 0 && (
          <div className="flex w-full flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5">
              <Clock size={11} className="text-[var(--axon-editor-foreground)] opacity-35" />
              <span className="text-[10px] uppercase tracking-widest text-[var(--axon-editor-foreground)] opacity-35">
                recent
              </span>
            </div>
            {recentFolders.map((folder) => {
              const parts = folder.split("/");
              const name = parts[parts.length - 1];
              const parent = parts.slice(0, -1).join("/");
              return (
                <button
                  key={folder}
                  onClick={() => onSelectRecentFolder(folder)}
                  className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                >
                  <FolderOpen
                    size={13}
                    className="shrink-0 text-[var(--axon-syntax-function)] opacity-45 transition-colors group-hover:opacity-100"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px] text-[var(--axon-editor-foreground)] opacity-75 transition-colors group-hover:opacity-100">
                      {name}
                    </span>
                    <span className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                      {parent}
                    </span>
                  </div>
                  <ChevronRight
                    size={11}
                    className="shrink-0 text-[var(--axon-editor-foreground)] opacity-0 transition-all group-hover:opacity-45"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
