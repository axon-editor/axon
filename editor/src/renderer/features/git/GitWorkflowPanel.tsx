import { useEffect, useState } from "react";
import { GitBranch, Plus, RefreshCw, Trash2, Archive } from "lucide-react";
import {
  type GitBranchListResult,
  type GitStashListResult,
} from "../../../shared/git";
import Tooltip from "../../shared/components/Tooltip";

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
    <div className="border-b border-[#222838] px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#586478]">
          <GitBranch size={12} />
          Git workflow
        </div>
        <Tooltip label="Refresh branches and stashes" side="bottom">
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
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
            className="h-7 min-w-0 flex-1 rounded border border-[#222838] bg-[#0b0e15] px-2 text-[11px] text-[#dce4f0] outline-none placeholder:text-[#364050] focus:border-[#3a455a]"
          />
          <button
            type="button"
            onClick={() => void createBranch()}
            disabled={!newBranchName.trim() || busyAction === "branch:create"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[#2a3346] text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="max-h-24 overflow-y-auto rounded border border-[#1b2130]">
          {(branches?.branches ?? []).slice(0, 8).map((branch) => (
            <button
              key={branch.name}
              type="button"
              onClick={() => void runBranchCheckout(branch.name)}
              disabled={branch.current || branch.remote || busyAction !== null}
              className={`flex w-full cursor-pointer items-center justify-between px-2 py-1.5 text-left text-[11px] transition-colors ${
                branch.current
                  ? "bg-[#142a36] text-[#dff7ff]"
                  : "text-[#9aa4b8] hover:bg-[#151923] hover:text-white"
              } disabled:cursor-default disabled:text-[#465166]`}
            >
              <span className="truncate">{branch.name}</span>
              {branch.current ? <span className="text-[#80c8e0]">current</span> : null}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={stashMessage}
            onChange={(event) => setStashMessage(event.target.value)}
            placeholder="stash message"
            className="h-7 min-w-0 flex-1 rounded border border-[#222838] bg-[#0b0e15] px-2 text-[11px] text-[#dce4f0] outline-none placeholder:text-[#364050] focus:border-[#3a455a]"
          />
          <button
            type="button"
            onClick={() => void createStash()}
            disabled={busyAction === "stash:create"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[#2a3346] text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
          >
            <Archive size={13} />
          </button>
        </div>

        <div className="max-h-28 overflow-y-auto rounded border border-[#1b2130]">
          {(stashes?.stashes ?? []).map((stash) => (
            <div
              key={stash.selector}
              className="flex items-center gap-2 border-b border-[#151923] px-2 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-[#c8d0e0]">
                  {stash.message}
                </div>
                <div className="truncate text-[10px] text-[#586478]">
                  {stash.selector} on {stash.branch}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runStashAction(stash.selector, "apply")}
                disabled={busyAction !== null}
                className="h-6 cursor-pointer rounded px-1.5 text-[10px] text-[#9aa4b8] hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
              >
                apply
              </button>
              <button
                type="button"
                onClick={() => void runStashAction(stash.selector, "pop")}
                disabled={busyAction !== null}
                className="h-6 cursor-pointer rounded px-1.5 text-[10px] text-[#9aa4b8] hover:bg-[#151923] hover:text-white disabled:cursor-not-allowed disabled:text-[#364050]"
              >
                pop
              </button>
              <button
                type="button"
                onClick={() => void runStashAction(stash.selector, "drop")}
                disabled={busyAction !== null}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#2a1517] hover:text-[#ff7b72] disabled:cursor-not-allowed disabled:text-[#364050]"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {(stashes?.stashes ?? []).length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-[#465166]">
              no stashes
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
