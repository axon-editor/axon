import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  FolderOpen,
  PanelsTopLeft,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Tooltip from "../../../../shared/components/Tooltip";
import { type OpenWorkspaceFolder } from "../../../../../shared/app";
import {
  getWorkspacePathComparisonKey,
  getWorkspaceRootName,
  type WorkspaceRoot,
} from "../../../../shared/lib/workspaceRoots";

interface Props {
  activeRootId: string | null;
  focusRecent: boolean;
  openWorkspaceFolders: OpenWorkspaceFolder[];
  recentFolders: string[];
  workspaceRoots: WorkspaceRoot[];
  onBrowse: () => void;
  onClearRecent: () => void;
  onClearSession: () => void;
  onFocusWorkspaceWindow: (rendererId: number) => void;
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
  focusRecent,
  openWorkspaceFolders,
  recentFolders,
  workspaceRoots,
  onBrowse,
  onClearRecent,
  onClearSession,
  onFocusWorkspaceWindow,
  onRemoveRecent,
  onSelect,
  onSelectWorkspaceRoot,
}: Props) {
  const [query, setQuery] = useState("");
  const activeRootPath = useMemo(
    () => workspaceRoots.find((root) => root.id === activeRootId)?.path ?? null,
    [activeRootId, workspaceRoots],
  );
  const activeRootPathKey = activeRootPath
    ? getWorkspacePathComparisonKey(activeRootPath, window.axon.platform)
    : null;
  const openWorkspaceByPath = useMemo(
    () =>
      new Map(
        openWorkspaceFolders.map((folder) => [
          getWorkspacePathComparisonKey(folder.path, window.axon.platform),
          folder,
        ]),
      ),
    [openWorkspaceFolders],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecentFolders = useMemo(() => {
    if (!normalizedQuery) return recentFolders;
    return recentFolders.filter((path) =>
      path.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, recentFolders]);

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
            {openWorkspaceFolders.length} open | {recentFolders.length}{" "}
            recent
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
              Open in Axon
            </span>
            <span className="ml-auto text-[10px] tabular-nums text-[var(--axon-editor-foreground)] opacity-30">
              {openWorkspaceFolders.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {openWorkspaceFolders.length > 0 ? (
              openWorkspaceFolders.map((root) => {
                const active =
                  root.currentWindow &&
                  getWorkspacePathComparisonKey(
                    root.path,
                    window.axon.platform,
                  ) === activeRootPathKey;
                return (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() =>
                      root.currentWindow
                        ? onSelectWorkspaceRoot(root.path)
                        : onFocusWorkspaceWindow(root.rendererId)
                    }
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
                    {active && (
                      <Check
                        size={13}
                        className="shrink-0 text-[var(--axon-syntax-function)]"
                      />
                    )}
                    {!active && !root.currentWindow && (
                      <Tooltip label="Focus open Axon window" side="left">
                        <PanelsTopLeft
                          size={13}
                          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-35"
                        />
                      </Tooltip>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-35">
                No folders are open in Axon.
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
              autoFocus={focusRecent}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter recent folders"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30"
            />
            {recentFolders.length > 0 && (
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
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredRecentFolders.length > 0 ? (
              filteredRecentFolders.map((path) => {
                const name = getWorkspaceRootName(path);
                const pathKey = getWorkspacePathComparisonKey(
                  path,
                  window.axon.platform,
                );
                const openFolder = openWorkspaceByPath.get(pathKey);
                const active =
                  openFolder?.currentWindow && pathKey === activeRootPathKey;
                return (
                  <div
                    key={path}
                    className="group flex w-full min-w-0 items-center rounded-md transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!openFolder) {
                          onSelect(path);
                          return;
                        }
                        if (openFolder.currentWindow) {
                          onSelectWorkspaceRoot(path);
                          return;
                        }
                        onFocusWorkspaceWindow(openFolder.rendererId);
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2 text-left"
                    >
                      {active ? (
                        <Check
                          size={14}
                          className="shrink-0 text-[var(--axon-syntax-function)]"
                        />
                      ) : openFolder ? (
                        <PanelsTopLeft
                          size={14}
                          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45 transition-colors group-hover:text-[var(--axon-syntax-function)] group-hover:opacity-80"
                        />
                      ) : (
                        <Clock3
                          size={14}
                          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-35 transition-colors group-hover:text-[var(--axon-syntax-function)] group-hover:opacity-80"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                            {name}
                          </span>
                          {openFolder && (
                            <span className="shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
                              {active ? "active" : "open"}
                            </span>
                          )}
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
          {recentFolders.length} recent
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
