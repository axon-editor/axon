import { useEffect, useState } from "react";
import { GitFork, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type GitWorktreeListResult } from "../../../../shared/git";
import Tooltip from "../../../shared/components/Tooltip";

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
  const [worktrees, setWorktrees] = useState<GitWorktreeListResult | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

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
    if (!folderPath || !targetPath.trim()) return;
    setBusyAction("worktree:add");
    try {
      const result = await window.axon.runGitWorktreeAction(folderPath, {
        type: "add",
        path: targetPath.trim(),
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
    if (!window.confirm(`Remove worktree ${path}?`)) return;

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
    <section className="space-y-2 rounded border border-[#1b2130] bg-[#090c12] p-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase text-[#7a8498]">
          <GitFork size={12} />
          Worktrees
          {entries.length > 0 ? (
            <span className="rounded bg-[#151923] px-1.5 text-[10px] text-[#647086]">
              {entries.length}
            </span>
          ) : null}
        </div>
        <Tooltip label="Refresh Git worktree list" side="bottom">
          <button
            type="button"
            aria-label="Refresh Git worktree list"
            onClick={() => void refresh()}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#151923] hover:text-white"
          >
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_72px_28px] gap-1">
        <input
          value={targetPath}
          onChange={(event) => setTargetPath(event.target.value)}
          placeholder="../axon-feature"
          className="h-7 min-w-0 rounded border border-[#222838] bg-[#0b0e15] px-2 text-[11px] text-[#dce4f0] outline-none placeholder:text-[#364050] focus:border-[#3a455a]"
        />
        <input
          value={branchName}
          onChange={(event) => setBranchName(event.target.value)}
          placeholder="branch"
          className="h-7 min-w-0 rounded border border-[#222838] bg-[#0b0e15] px-2 text-[11px] text-[#dce4f0] outline-none placeholder:text-[#364050] focus:border-[#3a455a]"
        />
        <Tooltip label="Create worktree at the typed path" side="bottom">
          <button
            type="button"
            aria-label="Create worktree at the typed path"
            onClick={() => void addWorktree()}
            disabled={!targetPath.trim() || busyAction === "worktree:add"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[#2a3346] text-[#80c8e0] hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
          >
            <Plus size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="max-h-32 overflow-y-auto rounded border border-[#151923]">
        {entries.map((worktree) => (
          <div
            key={worktree.path}
            className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 border-b border-[#151923] px-2 py-1.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-[11px] text-[#c8d0e0]">
                {worktree.path}
              </div>
              <div className="truncate text-[10px] text-[#586478]">
                {worktree.current ? "current · " : ""}
                {worktree.branch ?? worktree.head ?? "detached"}
              </div>
            </div>
            <Tooltip label={`Remove worktree ${worktree.path}`} side="bottom">
              <button
                type="button"
                aria-label={`Remove worktree ${worktree.path}`}
                disabled={worktree.current || busyAction !== null}
                onClick={() => void removeWorktree(worktree.path)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#2a1517] hover:text-[#ff7b72] disabled:cursor-not-allowed disabled:text-[#364050]"
              >
                <Trash2 size={11} />
              </button>
            </Tooltip>
          </div>
        ))}
        {entries.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-[#465166]">no worktrees</div>
        ) : null}
      </div>
    </section>
  );
}
