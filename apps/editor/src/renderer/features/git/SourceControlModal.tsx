import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  FileDiff,
  FileText,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import {
  type GitChange,
  type GitDiffResult,
  type GitFileState,
  type GitStatusResult,
} from "../../../shared/git";
import { type EditorSettings } from "../../../shared/settings";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import Tooltip from "../../shared/components/Tooltip";
import GitDiffEditorView from "./GitDiffEditorView";
import GitWorkflowPanel from "./GitWorkflowPanel";

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (path: string) => void;
  onGitStatusChanged: () => void;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

const stateLabels: Record<GitFileState, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
  ignored: "I",
  unknown: "?",
};

function SourceControlSkeleton() {
  return (
    <div className="space-y-3 px-3 py-2">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="grid grid-cols-[24px_1fr] gap-2">
          <div className="h-5 animate-pulse rounded bg-[var(--axon-panel-overlay-hover)]" />
          <div className="min-w-0 space-y-1.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--axon-panel-overlay-hover)]" />
            <div className="h-2.5 w-full animate-pulse rounded bg-[#111722]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffSkeleton() {
  return (
    <div className="space-y-2 px-4 py-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="grid grid-cols-[1fr_1fr] gap-3">
          <div className="h-4 animate-pulse rounded bg-[#111722]" />
          <div className="h-4 animate-pulse rounded bg-[#111722]" />
        </div>
      ))}
    </div>
  );
}

function changeLabel(change: GitChange) {
  if (change.indexState !== "unknown" && change.indexState !== "ignored") {
    return stateLabels[change.indexState];
  }
  return stateLabels[change.worktreeState];
}

function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export default function SourceControlModal({
  folderPath,
  open,
  onClose,
  onOpenFile,
  onOpenDiff,
  onGitStatusChanged,
  editorSettings,
  themeTokens,
  onOutput,
}: Props) {
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [selectedChange, setSelectedChange] = useState<GitChange | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const stagedChanges = useMemo(
    () => status?.changes.filter((change) => change.staged) ?? [],
    [status],
  );
  const unstagedChanges = useMemo(
    () => status?.changes.filter((change) => change.unstaged) ?? [],
    [status],
  );

  const loadStatus = async () => {
    if (!folderPath) return;

    setLoadingStatus(true);
    try {
      const nextStatus = await window.axon.getGitStatus(folderPath);
      setStatus(nextStatus);
      setSelectedChange((currentChange) => {
        if (!currentChange) return nextStatus.changes[0] ?? null;
        return (
          nextStatus.changes.find(
            (change) => change.path === currentChange.path,
          ) ??
          nextStatus.changes[0] ??
          null
        );
      });
      onOutput(
        nextStatus.isRepository
          ? `Git status loaded with ${nextStatus.changes.length} changed file${nextStatus.changes.length === 1 ? "" : "s"}.`
          : "Current workspace is not a Git repository.",
        nextStatus.isRepository ? "success" : "warning",
      );
    } catch (err) {
      console.error("failed to load git status:", err);
      onOutput("Failed to load Git status.", "error");
    } finally {
      setLoadingStatus(false);
    }
  };

  const runAction = async (
    change: GitChange,
    action: "stage" | "unstage" | "discard",
  ) => {
    if (!folderPath) return;
    // Discard is destructive, so the renderer confirms before it asks the main
    // process to run the path-scoped Git operation. The main process still owns
    // the shell boundary, but this keeps accidental clicks from silently
    // deleting editor work.
    if (
      action === "discard" &&
      !window.confirm(
        `Discard unstaged changes in ${change.path}? This cannot be undone.`,
      )
    ) {
      return;
    }

    const actionId = `${action}:${change.path}`;
    setRunningAction(actionId);
    try {
      const result = await window.axon.runGitAction(
        folderPath,
        change.path,
        action,
      );
      onOutput(result.message, result.ok ? "success" : "error");
      await loadStatus();
      onGitStatusChanged();
    } catch (err) {
      console.error("git action failed:", err);
      onOutput(`Failed to ${action} ${change.path}.`, "error");
    } finally {
      setRunningAction(null);
    }
  };

  const runBatchAction = async (
    changes: GitChange[],
    action: "stage" | "unstage" | "discard",
  ) => {
    if (!folderPath || changes.length === 0) return;
    if (
      action === "discard" &&
      !window.confirm(
        `Discard unstaged changes in ${changes.length} file(s)? This cannot be undone.`,
      )
    ) {
      return;
    }

    setRunningAction(`${action}:all`);
    try {
      // Batch actions deliberately reuse the single-file IPC instead of adding
      // a broad "git add ." command. That keeps every mutation path-scoped,
      // which is slower for many files but safer for an editor UI where users
      // expect exactly the visible files to be affected.
      const actionableChanges = changes.filter((change) => {
        if (action === "stage") return change.unstaged;
        if (action === "unstage") return change.staged;
        return change.unstaged;
      });
      for (const change of actionableChanges) {
        await window.axon.runGitAction(folderPath, change.path, action);
      }
      onOutput(
        `${action === "stage" ? "Staged" : action === "unstage" ? "Unstaged" : "Discarded"} ${actionableChanges.length} file${actionableChanges.length === 1 ? "" : "s"}.`,
        "success",
      );
      await loadStatus();
      onGitStatusChanged();
    } catch (err) {
      console.error("git batch action failed:", err);
      onOutput(`Failed to ${action} selected Git changes.`, "error");
    } finally {
      setRunningAction(null);
    }
  };

  const commitStagedChanges = async () => {
    if (!folderPath) return;
    setCommitting(true);
    try {
      const result = await window.axon.commitGitChanges(
        folderPath,
        commitMessage,
      );
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setCommitMessage("");
        await loadStatus();
        onGitStatusChanged();
      }
    } catch (err) {
      console.error("git commit failed:", err);
      onOutput("Failed to commit staged changes.", "error");
    } finally {
      setCommitting(false);
    }
  };

  const markCopied = (action: string) => {
    setCopiedAction(action);
    window.setTimeout(() => {
      setCopiedAction((currentAction) =>
        currentAction === action ? null : currentAction,
      );
    }, 1400);
  };

  const copySelectedDiff = async () => {
    if (!selectedChange || !diff) return;

    const context = [
      "Axon Git Context",
      `File: ${selectedChange.path}`,
      `Status: ${changeLabel(selectedChange)}`,
      "",
      "```diff",
      diff.diff.trim() || "No diff available.",
      "```",
    ].join("\n");

    try {
      await window.axon.copyText(context);
      markCopied("selected");
      onOutput(`Copied diff context for ${selectedChange.path}.`, "success");
    } catch (err) {
      console.error("failed to copy selected git diff:", err);
      onOutput(
        `Failed to copy diff context for ${selectedChange.path}.`,
        "error",
      );
    }
  };

  const copyAllDiffs = async () => {
    if (!folderPath || !status?.changes.length) return;

    try {
      const sections = await Promise.all(
        status.changes.map(async (change) => {
          const result = await window.axon.getGitDiff(
            folderPath,
            change.path,
            change.staged,
            change.indexState === "untracked",
          );

          return [
            `File: ${change.path}`,
            `Status: ${changeLabel(change)}`,
            "",
            "```diff",
            result.diff.trim() || "No diff available.",
            "```",
          ].join("\n");
        }),
      );

      await window.axon.copyText(
        [
          "Axon Workspace Git Context",
          `Branch: ${status.branch ?? "unknown"}`,
          `Changed files: ${status.changes.length}`,
          "",
          sections.join("\n\n---\n\n"),
        ].join("\n"),
      );
      markCopied("all");
      onOutput(
        `Copied Git context for ${status.changes.length} changed file${status.changes.length === 1 ? "" : "s"}.`,
        "success",
      );
    } catch (err) {
      console.error("failed to copy git context:", err);
      onOutput("Failed to copy Git context.", "error");
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadStatus();
  }, [open, folderPath]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!folderPath || !selectedChange) {
      setDiff(null);
      return;
    }

    setLoadingDiff(true);
    window.axon
      .getGitDiff(
        folderPath,
        selectedChange.path,
        selectedChange.staged,
        selectedChange.indexState === "untracked",
      )
      .then(setDiff)
      .catch((err) => {
        console.error("failed to load git diff:", err);
        setDiff({
          path: selectedChange.path,
          diff: "Failed to load diff.",
        });
      })
      .finally(() => setLoadingDiff(false));
  }, [folderPath, selectedChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#05070c]/35 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (panelRef.current?.contains(event.target as Node)) return;
        onClose();
      }}
    >
      <div
        ref={panelRef}
        className="absolute bottom-8 left-1/2 top-20 flex w-[min(1100px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03]"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-65">
            source control
          </span>
          <Tooltip label="Close" side="left">
            <button
              onClick={onClose}
              aria-label="Close source control"
              className="cursor-pointer text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:text-[var(--axon-editor-foreground)]"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-[var(--axon-panel-border)]">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
              <div className="flex min-w-0 items-center gap-2">
                <GitBranch size={14} className="text-[var(--axon-syntax-function)]" />
                <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
                  {status?.branch ?? "no repository"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip label="Stage all changes" side="bottom">
                  <button
                    onClick={() => void runBatchAction(unstagedChanges, "stage")}
                    disabled={
                      unstagedChanges.length === 0 ||
                      runningAction === "stage:all"
                    }
                    aria-label="Stage all changes"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Plus size={13} />
                  </button>
                </Tooltip>
                <Tooltip label="Unstage all staged files" side="bottom">
                  <button
                    onClick={() => void runBatchAction(stagedChanges, "unstage")}
                    disabled={
                      stagedChanges.length === 0 ||
                      runningAction === "unstage:all"
                    }
                    aria-label="Unstage all staged files"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Minus size={13} />
                  </button>
                </Tooltip>
                <Tooltip label="Copy all Git context" side="bottom">
                  <button
                    onClick={() => void copyAllDiffs()}
                    disabled={!status?.changes.length}
                    aria-label="Copy all Git context"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {copiedAction === "all" ? (
                      <Check size={13} />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </Tooltip>
                <Tooltip label="Refresh Git status" side="bottom">
                  <button
                    onClick={() => void loadStatus()}
                    aria-label="Refresh Git status"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                  >
                    <RefreshCw size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain py-2">
              <GitWorkflowPanel
                folderPath={folderPath}
                onChanged={() => {
                  void loadStatus();
                  onGitStatusChanged();
                }}
                onOutput={onOutput}
              />

              {!folderPath && (
                <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                  Open a folder to inspect Git changes.
                </div>
              )}

              {folderPath && loadingStatus && (
                <SourceControlSkeleton />
              )}

              {folderPath && status && !status.isRepository && (
                <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                  This workspace is not a Git repository.
                </div>
              )}

              {status?.isRepository && status.changes.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                  No changed files.
                </div>
              )}

              {stagedChanges.length > 0 && (
                <ChangeGroup
                  title="staged"
                  changes={stagedChanges}
                  selectedPath={selectedChange?.path ?? null}
                  onSelect={setSelectedChange}
                  onOpenFile={onOpenFile}
                  onOpenDiff={onOpenDiff}
                  onRunAction={runAction}
                  runningAction={runningAction}
                />
              )}

              {unstagedChanges.length > 0 && (
                <ChangeGroup
                  title="changes"
                  changes={unstagedChanges}
                  selectedPath={selectedChange?.path ?? null}
                  onSelect={setSelectedChange}
                  onOpenFile={onOpenFile}
                  onOpenDiff={onOpenDiff}
                  onRunAction={runAction}
                  runningAction={runningAction}
                />
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--axon-panel-border)] p-3">
              <textarea
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="commit message..."
                rows={4}
                className="min-h-20 w-full resize-none rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)] outline-none transition-colors placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 focus:border-[var(--axon-syntax-function)]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void runBatchAction(unstagedChanges, "discard")}
                  disabled={
                    unstagedChanges.length === 0 ||
                    runningAction === "discard:all"
                  }
                  className="h-7 cursor-pointer rounded-md px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[#2a1517] hover:text-[#ff7b72] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  discard all
                </button>
                <button
                  type="button"
                  onClick={() => void commitStagedChanges()}
                  disabled={
                    committing ||
                    stagedChanges.length === 0 ||
                    commitMessage.trim().length === 0
                  }
                  className="h-7 cursor-pointer rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[11px] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:border-[var(--axon-panel-border)] disabled:bg-transparent disabled:opacity-30"
                >
                  {committing ? "committing..." : "commit staged"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                  {selectedChange
                    ? getFileName(selectedChange.path)
                    : "No file selected"}
                </div>
                <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {selectedChange?.path ??
                    "Select a changed file to preview its diff"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip label="Copy selected diff context" side="bottom">
                  <button
                    onClick={() => void copySelectedDiff()}
                    disabled={!selectedChange || !diff}
                    aria-label="Copy selected diff context"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {copiedAction === "selected" ? (
                      <Check size={13} />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </Tooltip>
                <Tooltip label="Open file" side="bottom">
                  <button
                    onClick={() =>
                      selectedChange && onOpenFile(selectedChange.absolutePath)
                    }
                    disabled={!selectedChange}
                    aria-label="Open file"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <FileText size={13} />
                  </button>
                </Tooltip>
                <Tooltip label="Close source control" side="bottom">
                  <button
                    onClick={onClose}
                    aria-label="Close source control"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--axon-editor-background)]">
              {loadingDiff && (
                <DiffSkeleton />
              )}
              {!loadingDiff && !selectedChange && (
                <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                  Select a changed file to view diff context.
                </div>
              )}
              {!loadingDiff && selectedChange && (
                diff?.diff.trim() ||
                diff?.baseContent ||
                diff?.currentContent ? (
                  <GitDiffEditorView
                    filePath={selectedChange.path}
                    original={diff?.baseContent ?? ""}
                    modified={diff?.currentContent ?? ""}
                    editorSettings={editorSettings}
                    themeTokens={themeTokens}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                    No diff available yet. Save the file first if the change is
                    only in the editor buffer.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeGroup({
  title,
  changes,
  selectedPath,
  onSelect,
  onOpenFile,
  onOpenDiff,
  onRunAction,
  runningAction,
}: {
  title: string;
  changes: GitChange[];
  selectedPath: string | null;
  onSelect: (change: GitChange) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (path: string) => void;
  onRunAction: (
    change: GitChange,
    action: "stage" | "unstage" | "discard",
  ) => void;
  runningAction: string | null;
}) {
  return (
    <div className="mb-3">
      <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
        {title} {changes.length}
      </div>
      {changes.map((change) => {
        const selected = change.path === selectedPath;
        const canStage = change.unstaged;
        const canUnstage = change.staged;
        const canDiscard = change.unstaged;
        return (
          <div
            key={`${title}:${change.path}`}
            className={`grid w-full cursor-pointer grid-cols-[24px_1fr] items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              selected
                ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-background)] hover:text-[var(--axon-editor-foreground)]"
            }`}
            onClick={() => onSelect(change)}
            onDoubleClick={() => onOpenFile(change.absolutePath)}
          >
            <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-center text-[10px] text-[var(--axon-syntax-function)]">
              {changeLabel(change)}
            </span>
            <span className="min-w-0 pr-1">
              <span className="block truncate text-[12px]">
                {getFileName(change.path)}
              </span>
              <span className="block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {change.path}
              </span>
            </span>
            {selected && (
              <div className="col-span-2 ml-[32px] mt-1 flex items-center gap-1">
                <GitActionButton
                  label="Open diff"
                  disabled={false}
                  onClick={() => onOpenDiff(change.absolutePath)}
                >
                  <FileDiff size={12} />
                </GitActionButton>
                <GitActionButton
                  label="Stage file"
                  disabled={!canStage || runningAction === `stage:${change.path}`}
                  onClick={() => onRunAction(change, "stage")}
                >
                  <Plus size={12} />
                </GitActionButton>
                <GitActionButton
                  label="Unstage file"
                  disabled={
                    !canUnstage || runningAction === `unstage:${change.path}`
                  }
                  onClick={() => onRunAction(change, "unstage")}
                >
                  <Minus size={12} />
                </GitActionButton>
                <GitActionButton
                  label="Discard unstaged changes"
                  disabled={
                    !canDiscard || runningAction === `discard:${change.path}`
                  }
                  danger
                  onClick={() => onRunAction(change, "discard")}
                >
                  <RotateCcw size={12} />
                </GitActionButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GitActionButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onClick();
        }}
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
          disabled
            ? "cursor-not-allowed text-[var(--axon-editor-foreground)] opacity-30"
            : danger
              ? "cursor-pointer text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[#2a1517] hover:text-[#ff7b72] hover:opacity-100"
              : "cursor-pointer text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-syntax-function)] hover:opacity-100"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
