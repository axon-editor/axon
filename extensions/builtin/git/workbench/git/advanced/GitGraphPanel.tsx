import { useEffect, useMemo, useState } from "react";
import { GitBranch, RefreshCw, Search } from "lucide-react";
import {
  type GitGraphResult,
  type GitHistoryResult,
} from "@axon-editor/shared/git";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import { openGitCommitDiff } from "../lib/gitGraphTab";
import CommitDetails from "./gitGraph/CommitDetails";
import CommitRow from "./gitGraph/CommitRow";
import RefChip from "./gitGraph/RefChip";

interface Props {
  folderPath: string | null;
  variant?: "compact" | "full";
}

export default function GitGraphPanel({
  folderPath,
  variant = "compact",
}: Props) {
  const [graph, setGraph] = useState<GitGraphResult | null>(null);
  const [history, setHistory] = useState<GitHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const refresh = async () => {
    if (!folderPath) {
      setGraph(null);
      setHistory(null);
      return;
    }
    setLoading(true);
    try {
      const [nextGraph, nextHistory] = await Promise.all([
        window.axon.getGitGraph(folderPath),
        window.axon.getGitHistory(folderPath),
      ]);
      setGraph(nextGraph);
      setHistory(nextHistory);
      setSelectedHash(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch((err) =>
      console.error("failed to load Git graph:", err),
    );
  }, [folderPath]);

  const historyByHash = useMemo(
    () =>
      new Map((history?.commits ?? []).map((commit) => [commit.hash, commit])),
    [history],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const commits = (graph?.commits ?? []).filter(
    (commit) =>
      !normalizedQuery ||
      [
        commit.subject,
        commit.authorName,
        commit.shortHash,
        ...commit.refs,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
  const visibleCommits = variant === "full" ? commits : commits.slice(0, 30);
  const laneCount = Math.min(
    5,
    Math.max(1, ...visibleCommits.map((commit) => commit.lane + 1)),
  );
  const selectedCommit = selectedHash
    ? (historyByHash.get(selectedHash) ?? null)
    : null;

  const openCommitFile = async (
    file: NonNullable<typeof selectedCommit>["files"][number],
  ) => {
    if (!folderPath || !selectedCommit) return;
    const diff = await window.axon.getGitCommitDiff(
      folderPath,
      selectedCommit.hash,
      file.path,
      file.oldPath,
    );
    openGitCommitDiff({ commit: selectedCommit, file, diff });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] px-3">
        <GitBranch size={14} className="text-[var(--axon-syntax-function)]" />
        <span className="truncate text-[12px] text-[var(--axon-editor-foreground)]">
          {graph?.root?.split(/[\\/]/).pop() ?? "Git history"}
        </span>
        {graph?.branch ? <RefChip value={graph.branch} /> : null}
        <Tooltip label="Refresh commit graph" side="bottom">
          <button
            type="button"
            aria-label="Refresh commit graph"
            onClick={() => void refresh()}
            className="ml-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </Tooltip>
      </div>
      <div className="flex h-12 shrink-0 items-center border-b border-[var(--axon-panel-border)] px-3">
        <div className="flex h-8 w-full max-w-[720px] items-center gap-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5">
          <Search
            size={13}
            className="text-[var(--axon-editor-foreground)] opacity-40"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commits..."
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:opacity-35"
          />
          <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
            {visibleCommits.length}/{graph?.commits.length ?? 0}
          </span>
        </div>
      </div>
      <div
        className={`grid min-h-0 flex-1 overflow-hidden ${selectedCommit ? "grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col ${selectedCommit ? "border-r border-[var(--axon-panel-border)]" : ""}`}
        >
          <div className="grid h-8 shrink-0 grid-cols-[110px_minmax(220px,1fr)_120px_130px_72px] items-center border-b border-[var(--axon-panel-border)] px-3 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
            <span>Graph</span>
            <span>Description</span>
            <span>Date</span>
            <span>Author</span>
            <span>Commit</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {visibleCommits.map((commit) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                details={historyByHash.get(commit.hash) ?? null}
                laneCount={laneCount}
                selected={selectedHash === commit.hash}
                onSelect={() => setSelectedHash(commit.hash)}
              />
            ))}
            {visibleCommits.length === 0 ? (
              <div className="px-4 py-12 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-40">
                {graph?.ok === false ? graph.message : "No matching commits."}
              </div>
            ) : null}
          </div>
        </div>
        {selectedCommit ? (
          <CommitDetails
            commit={selectedCommit}
            onOpenFile={(file) =>
              void openCommitFile(file).catch((error) =>
                console.error("failed to open commit diff:", error),
              )
            }
          />
        ) : null}
      </div>
    </section>
  );
}
