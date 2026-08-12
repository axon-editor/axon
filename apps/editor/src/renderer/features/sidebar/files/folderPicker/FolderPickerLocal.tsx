import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  FolderOpen,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Tooltip from "../../../../shared/components/Tooltip";
import {
  getWorkspaceRootName,
  type WorkspaceRoot,
} from "../../../../shared/lib/workspaceRoots";

interface Props {
  activeRootId: string | null;
  recentFolders: string[];
  workspaceRoots: WorkspaceRoot[];
  onBrowse: () => void;
  onClearRecent: () => void;
  onClearSession: () => void;
  onRemoveRecent: (path: string) => void;
  onSelect: (path: string) => void;
  onSelectWorkspaceRoot: (path: string) => void;
}

function getParentPath(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  if (separatorIndex <= 0) return normalized;
  return normalized.slice(0, separatorIndex);
}

export default function FolderPickerLocal({
  activeRootId,
  recentFolders,
  workspaceRoots,
  onBrowse,
  onClearRecent,
  onClearSession,
  onRemoveRecent,
  onSelect,
  onSelectWorkspaceRoot,
}: Props) {
  const [query, setQuery] = useState("");
  const workspacePaths = useMemo(
    () => new Set(workspaceRoots.map((root) => root.path)),
    [workspaceRoots],
  );
  const availableRecentFolders = useMemo(
    () => recentFolders.filter((path) => !workspacePaths.has(path)),
    [recentFolders, workspacePaths],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecentFolders = useMemo(() => {
    if (!normalizedQuery) return availableRecentFolders;
    return availableRecentFolders.filter((path) =>
      path.toLowerCase().includes(normalizedQuery),
    );
  }, [availableRecentFolders, normalizedQuery]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-[var(--axon-panel-border)] px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]">
          <FolderOpen size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">
            Choose a folder
          </div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
            {workspaceRoots.length} workspace | {availableRecentFolders.length} recent
          </div>
        </div>
        <button
          type="button"
          onClick={onBrowse}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md bg-[var(--axon-syntax-function)] px-3 text-[11px] font-medium text-[var(--axon-editor-background)] transition-opacity hover:opacity-85"
        >
          <FolderOpen size={13} />
          Browse...
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:grid-rows-1">
        <section className="flex min-h-0 flex-col border-b border-[var(--axon-panel-border)] sm:border-b-0 sm:border-r">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] px-4">
            <FolderOpen
              size={12}
              className="text-[var(--axon-editor-foreground)] opacity-40"
            />
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55">
              Workspace
            </span>
            <span className="ml-auto text-[10px] tabular-nums text-[var(--axon-editor-foreground)] opacity-30">
              {workspaceRoots.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {workspaceRoots.length > 0 ? (
              workspaceRoots.map((root) => {
                const active = root.id === activeRootId;
                return (
                  <button
                    key={root.id}
                    type="button"
                    onClick={() => onSelectWorkspaceRoot(root.path)}
                    className={`group flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "bg-[var(--axon-panel-overlay-hover)]"
                        : "hover:bg-[var(--axon-panel-overlay-hover)]"
                    }`}
                  >
                    <FolderOpen
                      size={15}
                      className={`shrink-0 ${
                        active
                          ? "text-[var(--axon-syntax-function)]"
                          : "text-[var(--axon-editor-foreground)] opacity-45 group-hover:opacity-75"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)]">
                        {root.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                        {getParentPath(root.path)}
                      </span>
                    </span>
                    {active ? (
                      <Check
                        size={13}
                        className="shrink-0 text-[var(--axon-syntax-function)]"
                      />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-35">
                No workspace folders are open.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] px-3">
            <Search
              size={13}
              className="shrink-0 text-[var(--axon-editor-foreground)] opacity-35"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter recent folders"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30"
            />
            {availableRecentFolders.length > 0 ? (
              <Tooltip label="Clear recent folders" side="left">
                <button
                  type="button"
                  onClick={onClearRecent}
                  aria-label="Clear recent folders"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-35 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-danger-foreground)] hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </Tooltip>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredRecentFolders.length > 0 ? (
              filteredRecentFolders.map((path) => {
                const name = getWorkspaceRootName(path);
                return (
                  <div
                    key={path}
                    className="group flex w-full min-w-0 items-center rounded-md transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(path)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2 text-left"
                    >
                      <Clock3
                        size={14}
                        className="shrink-0 text-[var(--axon-editor-foreground)] opacity-35 transition-colors group-hover:text-[var(--axon-syntax-function)] group-hover:opacity-80"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)]">
                          {name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                          {getParentPath(path)}
                        </span>
                      </span>
                    </button>
                    <Tooltip label={`Remove ${name}`} side="left">
                      <button
                        type="button"
                        onClick={() => onRemoveRecent(path)}
                        aria-label={`Remove ${name} from recent folders`}
                        className="mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-0 transition-all hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-danger-foreground)] group-hover:opacity-40"
                      >
                        <X size={12} />
                      </button>
                    </Tooltip>
                  </div>
                );
              })
            ) : (
              <div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-35">
                {normalizedQuery
                  ? "No recent folders match this filter."
                  : "No recent folders yet."}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between border-t border-[var(--axon-panel-border)] px-4">
        <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-30">
          {availableRecentFolders.length} recent
        </span>
        <button
          type="button"
          onClick={onClearSession}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-danger-foreground)] hover:opacity-100"
        >
          <Trash2 size={11} />
          Clear saved workspace state
        </button>
      </div>
    </div>
  );
}
