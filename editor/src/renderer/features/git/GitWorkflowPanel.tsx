import { useEffect, useState } from "react";
import { GitBranch, Plus, RefreshCw, Trash2, Archive } from "lucide-react";
import {
  type GitBranchListResult,
  type GitStashListResult,
} from "../../../shared/git";
import Tooltip from "../../shared/components/Tooltip";
import GitConflictPanel from "./advanced/GitConflictPanel";
import GitGraphPanel from "./advanced/GitGraphPanel";
import GitWorktreePanel from "./advanced/GitWorktreePanel";

interface Props {
  folderPath: string | null;
  onChanged: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

export default function GitWorkflowPanel({
  folderPath,
  onChanged,
  onOutput,
}: Props) {
  const [branches, setBranches] = useState<GitBranchListResult | null>(null);
  const [stashes, setStashes] = useState<GitStashListResult | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [stashMessage, setStashMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = async () => {
    if (!folderPath) {
      setBranches(null);
      setStashes(null);
      return;
    }

    const [nextBranches, nextStashes] = await Promise.all([
      window.axon.listGitBranches(folderPath),
      window.axon.listGitStashes(folderPath),
    ]);
    setBranches(nextBranches);
    setStashes(nextStashes);
  };

  useEffect(() => {
    void refresh().catch((err) => {
      console.error("failed to load Git workflows:", err);
    });
  }, [folderPath]);

  const runBranchCheckout = async (name: string) => {
    if (!folderPath) return;
    setBusyAction(`checkout:${name}`);
    try {
      const result = await window.axon.runGitBranchAction(folderPath, {
        type: "checkout",
        name,
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

  const createBranch = async () => {
    if (!folderPath || !newBranchName.trim()) return;
    setBusyAction("branch:create");
    try {
      const result = await window.axon.runGitBranchAction(folderPath, {
        type: "create",
        name: newBranchName.trim(),
        checkout: true,
      });
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setNewBranchName("");
        await refresh();
        onChanged();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const createStash = async () => {
    if (!folderPath) return;
    setBusyAction("stash:create");
    try {
      const result = await window.axon.runGitStashAction(folderPath, {
        type: "create",
        message: stashMessage,
        includeUntracked: true,
      });
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setStashMessage("");
        await refresh();
        onChanged();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const runStashAction = async (
    selector: string,
    type: "apply" | "pop" | "drop",
  ) => {
    if (!folderPath) return;
    setBusyAction(`stash:${type}:${selector}`);
    try {
      const result = await window.axon.runGitStashAction(folderPath, {
        type,
        selector,
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

  return (
    <div className="border-b border-[var(--axon-panel-border)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
          <GitBranch size={12} />
          Git workflow
        </div>
        <Tooltip label="Refresh branches and stashes" side="bottom">
          <button
            type="button"
            aria-label="Refresh branches and stashes"
            onClick={() => void refresh()}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
          >
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={newBranchName}
            onChange={(event) => setNewBranchName(event.target.value)}
            placeholder="new branch"
            className="h-7 min-w-0 flex-1 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] opacity-30 focus:border-[var(--axon-syntax-function)]"
          />
          <Tooltip label="Create branch with the typed name" side="bottom">
            <button
              type="button"
              aria-label="Create branch with the typed name"
              onClick={() => void createBranch()}
              disabled={!newBranchName.trim() || busyAction === "branch:create"}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[var(--axon-panel-border)] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
          </Tooltip>
        </div>

        <div className="max-h-24 overflow-y-auto rounded border border-[var(--axon-panel-border)]">
          {(branches?.branches ?? []).slice(0, 8).map((branch) => (
            <button
              key={branch.name}
              type="button"
              onClick={() => void runBranchCheckout(branch.name)}
              disabled={branch.current || branch.remote || busyAction !== null}
              className={`flex w-full cursor-pointer items-center justify-between px-2 py-1.5 text-left text-[11px] transition-colors ${
                branch.current
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
              } disabled:cursor-default disabled:opacity-35`}
            >
              <span className="truncate">{branch.name}</span>
              {branch.current ? <span className="text-[var(--axon-syntax-function)]">current</span> : null}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={stashMessage}
            onChange={(event) => setStashMessage(event.target.value)}
            placeholder="stash message"
            className="h-7 min-w-0 flex-1 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] opacity-30 focus:border-[var(--axon-syntax-function)]"
          />
          <Tooltip
            label="Save uncommitted changes to Git stash and hide them from Source Control"
            side="bottom"
          >
            <button
              type="button"
              aria-label="Save uncommitted changes to Git stash and hide them from Source Control"
              onClick={() => void createStash()}
              disabled={busyAction === "stash:create"}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[var(--axon-panel-border)] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Archive size={13} />
            </button>
          </Tooltip>
        </div>

        <div className="max-h-28 overflow-y-auto rounded border border-[var(--axon-panel-border)]">
          {(stashes?.stashes ?? []).map((stash) => (
            <div
              key={stash.selector}
              className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-2 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-[var(--axon-editor-foreground)]">
                  {stash.message}
                </div>
                <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                  {stash.selector} on {stash.branch}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runStashAction(stash.selector, "apply")}
                disabled={busyAction !== null}
                className="h-6 cursor-pointer rounded px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                apply
              </button>
              <button
                type="button"
                onClick={() => void runStashAction(stash.selector, "pop")}
                disabled={busyAction !== null}
                className="h-6 cursor-pointer rounded px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                pop
              </button>
              <Tooltip label={`Delete stash ${stash.selector}`} side="bottom">
                <button
                  type="button"
                  aria-label={`Delete stash ${stash.selector}`}
                  onClick={() => void runStashAction(stash.selector, "drop")}
                  disabled={busyAction !== null}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[#2a1517] hover:text-[#ff7b72] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={11} />
                </button>
              </Tooltip>
            </div>
          ))}
          {(stashes?.stashes ?? []).length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-35">
              {stashes?.ok === false
                ? stashes.message
                : "no stashes - refresh after creating one"}
            </div>
          ) : null}
        </div>

        <GitConflictPanel
          folderPath={folderPath}
          onChanged={onChanged}
          onOutput={onOutput}
        />

        <GitWorktreePanel
          folderPath={folderPath}
          onChanged={onChanged}
          onOutput={onOutput}
        />

        <GitGraphPanel folderPath={folderPath} />
      </div>
    </div>
  );
}
