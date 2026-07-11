import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Clock,
  FolderOpen,
  GitFork,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import CommandModal from "../../../shared/components/CommandModal";
import { type WorkspaceRoot } from "../../../shared/lib/workspaceRoots";
import { type GitCloneProgress } from "../../../../shared/git";

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
  const [mode, setMode] = useState<"local" | "clone">("local");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<GitCloneProgress | null>(
    null,
  );
  const cloneRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return window.axon.onGitCloneProgress((event) => {
      if (event.requestId !== cloneRequestIdRef.current) return;
      setCloneProgress({
        phase: event.phase,
        percent: event.percent,
        message: event.message,
      });
    });
  }, []);

  const openNativeFolderPicker = () => {
    onClose();

    // The native folder dialog is outside React, so keeping Axon's picker
    // mounted while Electron starts that dialog only adds another overlay to
    // the handoff. Closing first leaves the renderer idle before the OS sheet
    // appears and avoids a stale modal after the workspace has changed.
    window.requestAnimationFrame(() => {
      onOpenNew();
    });
  };

  const selectFolderAfterClose = (path: string) => {
    onClose();

    // Opening a workspace replaces the file tree, editor layout, services,
    // terminals, and project state. Starting that transition after the modal
    // unmounts gives React one clean ownership boundary for the switch.
    window.requestAnimationFrame(() => {
      onSelect(path);
    });
  };

  const selectWorkspaceRootAfterClose = (path: string) => {
    onClose();
    window.requestAnimationFrame(() => {
      onSelectWorkspaceRoot?.(path);
    });
  };

  const cloneRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cloning) return;

    const url = repositoryUrl.trim();
    if (!url) {
      setCloneError("Enter a repository URL.");
      return;
    }

    setCloning(true);
    setCloneError(null);
    const requestId = globalThis.crypto.randomUUID();
    cloneRequestIdRef.current = requestId;
    setCloneProgress({
      phase: "starting",
      percent: null,
      message: "Choose clone destination",
    });
    try {
      const result = await window.axon.cloneGitRepository(url, requestId);
      if (result.canceled) {
        setCloneProgress(null);
        return;
      }
      if (!result.ok || !result.folderPath) {
        setCloneError(result.message || "Git clone failed.");
        return;
      }

      // Main has granted a workspace capability for the exact checkout path
      // before returning it. Reusing the normal folder-selection path means a
      // cloned project gets the same tree, recent-folder, LSP, Git, terminal,
      // and session initialization as a locally browsed folder.
      selectFolderAfterClose(result.folderPath);
    } catch (err) {
      setCloneError(
        err instanceof Error ? err.message : "Git clone failed unexpectedly.",
      );
    } finally {
      cloneRequestIdRef.current = null;
      setCloning(false);
    }
  };

  return (
    <CommandModal
      title="open project"
      onClose={onClose}
      width="w-[500px]"
      animate={false}
      closeDelayMs={0}
    >
      <div className="p-2">
        <div className="grid grid-cols-2 gap-1 rounded bg-[var(--axon-editor-background)] p-1">
          <button
            type="button"
            onClick={() => setMode("local")}
            aria-pressed={mode === "local"}
            className={`flex h-8 cursor-pointer items-center justify-center gap-2 rounded text-[11px] transition-colors ${
              mode === "local"
                ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
                : "text-[var(--axon-editor-foreground)] opacity-55 hover:opacity-100"
            }`}
          >
            <FolderOpen size={13} />
            local folder
          </button>
          <button
            type="button"
            onClick={() => setMode("clone")}
            aria-pressed={mode === "clone"}
            className={`flex h-8 cursor-pointer items-center justify-center gap-2 rounded text-[11px] transition-colors ${
              mode === "clone"
                ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
                : "text-[var(--axon-editor-foreground)] opacity-55 hover:opacity-100"
            }`}
          >
            <GitFork size={13} />
            clone repository
          </button>
        </div>

        {mode === "local" ? (
          <>
            <button
              type="button"
              onClick={openNativeFolderPicker}
              className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded px-3 py-2.5 text-[12px] text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-sidebar-hover-background)]"
            >
              <FolderOpen size={14} className="shrink-0" />
              <span>browse folders...</span>
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
                  const parent = root.path
                    .split(/[\\/]/)
                    .slice(0, -1)
                    .join("/");
                  const active = root.id === activeRootId;
                  return (
                    <button
                      key={root.id}
                      type="button"
                      onClick={() => selectWorkspaceRootAfterClose(root.path)}
                      className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                        active
                          ? "bg-[var(--axon-sidebar-hover-background)] text-[var(--axon-editor-foreground)]"
                          : "text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-sidebar-hover-background)]"
                      }`}
                    >
                      <FolderOpen
                        size={14}
                        className={`shrink-0 ${
                          active
                            ? "text-[var(--axon-syntax-function)]"
                            : "text-[var(--axon-editor-foreground)] opacity-55"
                        }`}
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

            {recentFolders.length > 0 ? (
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
                  const parts = folder.split(/[\\/]/);
                  const name = parts[parts.length - 1];
                  const parent = parts.slice(0, -1).join("/");
                  return (
                    <div
                      key={folder}
                      className="group flex w-full items-center gap-2 rounded px-1 transition-colors hover:bg-[var(--axon-sidebar-hover-background)]"
                    >
                      <button
                        type="button"
                        onClick={() => selectFolderAfterClose(folder)}
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
            ) : (
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
          </>
        ) : (
          <form onSubmit={cloneRepository} className="p-3">
            <label
              htmlFor="axon-clone-repository-url"
              className="text-[10px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55"
            >
              repository URL
            </label>
            <div className="mt-2 flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-1 pb-2 focus-within:border-[var(--axon-syntax-function)]">
              <GitFork
                size={14}
                className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
              />
              <input
                id="axon-clone-repository-url"
                type="text"
                inputMode="url"
                value={repositoryUrl}
                onChange={(event) => {
                  setRepositoryUrl(event.target.value);
                  if (cloneError) setCloneError(null);
                }}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={cloning}
                placeholder="https://github.com/owner/project.git"
                className="h-8 min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 disabled:opacity-55"
              />
            </div>

            {cloneError && (
              <div
                role="alert"
                className="mt-3 break-words text-[11px] leading-4 text-[#ff7b72]"
              >
                {cloneError}
              </div>
            )}

            {cloning && cloneProgress && (
              <div className="mt-4" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-[10px] text-[var(--axon-editor-foreground)] opacity-65">
                  <span className="truncate">{cloneProgress.message}</span>
                  {cloneProgress.percent !== null && (
                    <span className="shrink-0 tabular-nums">
                      {cloneProgress.percent}%
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--axon-editor-background)]">
                  <div
                    className={`h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150 ${
                      cloneProgress.percent === null ? "animate-pulse" : ""
                    }`}
                    style={{
                      width:
                        cloneProgress.percent === null
                          ? "35%"
                          : `${cloneProgress.percent}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={cloning || !repositoryUrl.trim()}
              className="mt-4 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded bg-[var(--axon-syntax-function)] px-3 text-[11px] font-medium text-[var(--axon-editor-background)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-35"
            >
              {cloning ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <FolderOpen size={13} />
              )}
              {cloning ? "cloning repository..." : "choose destination and clone"}
            </button>
          </form>
        )}
      </div>
    </CommandModal>
  );
}
