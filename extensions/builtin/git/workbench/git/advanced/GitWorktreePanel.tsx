import { useEffect, useState } from "react";
import { GitFork, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type GitWorktreeListResult } from "@axon-editor/shared/git";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import GitConfirmationDialog from "../GitConfirmationDialog";

interface Props {
  folderPath: string | null;
  onChanged: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

export default function GitWorktreePanel({
  folderPath,
  onChanged,
  onOutput,
}: Props) {
  const [worktrees, setWorktrees] = useState<GitWorktreeListResult | null>(
    null,
  );
  const [targetPath, setTargetPath] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingRemovalPath, setPendingRemovalPath] = useState<string | null>(
    null,
  );

  const refresh = async () => {
    if (!folderPath) {
      setWorktrees(null);
      return;
    }
    setWorktrees(await window.axon.listGitWorktrees(folderPath));
  };

  useEffect(() => {
    void refresh().catch((err) => {
      console.error("failed to load Git worktrees:", err);
    });
  }, [folderPath]);

  const addWorktree = async () => {
    if (!folderPath) return;
    setBusyAction("worktree:add");
    try {
      const selectedPath = await window.axon.selectGitWorktreePath(folderPath);
      if (!selectedPath) return;
      setTargetPath(selectedPath);
      const result = await window.axon.runGitWorktreeAction(folderPath, {
        type: "add",
        path: selectedPath,
        createBranch: branchName.trim() || undefined,
      });
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setTargetPath("");
        setBranchName("");
        await refresh();
        onChanged();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const removeWorktree = async (path: string) => {
    if (!folderPath) return;

    setBusyAction(`worktree:remove:${path}`);
    try {
      const result = await window.axon.runGitWorktreeAction(folderPath, {
        type: "remove",
        path,
      });
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        await refresh();
        onChanged();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const entries = worktrees?.worktrees ?? [];

  return (
    <>
      <section className="space-y-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-2">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase text-[var(--axon-editor-foreground)] opacity-55">
            <GitFork size={12} />
            Worktrees
            {entries.length > 0 ? (
              <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {entries.length}
              </span>
            ) : null}
          </div>
          <Tooltip label="Refresh Git worktree list" side="bottom">
            <button
              type="button"
              aria-label="Refresh Git worktree list"
              onClick={() => void refresh()}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
            >
              <RefreshCw size={12} />
            </button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_72px_28px] gap-1">
          <input
            value={targetPath}
            readOnly
            placeholder="choose location"
            className="h-7 min-w-0 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30"
          />
          <input
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            placeholder="branch"
            className="h-7 min-w-0 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 focus:border-[var(--axon-syntax-function)]"
          />
          <Tooltip label="Choose a directory and create worktree" side="bottom">
            <button
              type="button"
              aria-label="Choose a directory and create worktree"
              onClick={() => void addWorktree()}
              disabled={busyAction === "worktree:add"}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[var(--axon-panel-border)] text-[var(--axon-syntax-function)] hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
          </Tooltip>
        </div>

        <div className="max-h-32 overflow-y-auto rounded border border-[var(--axon-panel-border)]">
          {entries.map((worktree) => (
            <div
              key={worktree.path}
              className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 border-b border-[var(--axon-panel-border)] px-2 py-1.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] text-[var(--axon-editor-foreground)]">
                  {worktree.path}
                </div>
                <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {worktree.current ? "current · " : ""}
                  {worktree.branch ?? worktree.head ?? "detached"}
                </div>
              </div>
              <Tooltip label={`Remove worktree ${worktree.path}`} side="bottom">
                <button
                  type="button"
                  aria-label={`Remove worktree ${worktree.path}`}
                  disabled={worktree.current || busyAction !== null}
                  onClick={() => setPendingRemovalPath(worktree.path)}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-danger-background)] hover:text-[var(--axon-danger-foreground)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={11} />
                </button>
              </Tooltip>
            </div>
          ))}
          {entries.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
              no worktrees
            </div>
          ) : null}
        </div>
      </section>
      {pendingRemovalPath ? (
        <GitConfirmationDialog
          title="Remove Git worktree?"
          description={`Remove the worktree at ${pendingRemovalPath}? The checked-out directory will be removed from Git's worktree list.`}
          confirmLabel="Remove Worktree"
          onCancel={() => setPendingRemovalPath(null)}
          onConfirm={() => {
            const path = pendingRemovalPath;
            setPendingRemovalPath(null);
            void removeWorktree(path);
          }}
        />
      ) : null}
    </>
  );
}
