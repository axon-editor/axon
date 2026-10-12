/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, RefreshCw, Search } from "lucide-react";
import {
  type GitGraphResult,
  type GitHistoryCommit,
  type GitHistoryResult,
} from "@axon-editor/shared/workspace/git";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import { openGitCommitDiff } from "../lib/gitGraphTab";
import CommitDetails from "./gitGraph/commit/CommitDetails";
import CommitRow from "./gitGraph/commit/CommitRow";
import RefChip from "./gitGraph/graph/RefChip";
import {
  getCachedGitGraphData,
  invalidateGitGraphData,
  loadGitGraphData,
} from "./gitGraph/graph/gitGraphData";

interface Props {
  folderPath: string | null;
  variant?: "compact" | "full";
}

export default function GitGraphPanel({
  folderPath,
  variant = "compact",
}: Props) {
  const initialData = folderPath ? getCachedGitGraphData(folderPath) : null;
  const [graph, setGraph] = useState<GitGraphResult | null>(
    initialData?.graph ?? null,
  );
  const [history, setHistory] = useState<GitHistoryResult | null>(
    initialData?.history ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [detailByHash, setDetailByHash] = useState<
    Map<string, GitHistoryCommit>
  >(new Map());
  const [loadingDetail, setLoadingDetail] = useState(false);

  const refresh = useCallback(
    async (forceRefresh = false) => {
      if (!folderPath) {
        setGraph(null);
        setHistory(null);
        return;
      }
      setLoading(true);
      try {
        const data = await loadGitGraphData(folderPath, forceRefresh);
        setGraph(data.graph);
        setHistory(data.history);
      } finally {
        setLoading(false);
      }
    },
    [folderPath],
  );

  useEffect(() => {
    let active = true;
    setSelectedHash(null);
    setDetailByHash(new Map());
    if (!folderPath) {
      setGraph(null);
      setHistory(null);
      return;
    }

    // Paint the cached graph first so switching tabs never flashes empty, then
    // reconcile in the background. The shared cache is keyed by folder and does
    // not know about external checkouts or history rewrites, so this background
    // pass is what keeps the panel honest after the repository moves under it.
    const cached = getCachedGitGraphData(folderPath);
    if (cached) {
      setGraph(cached.graph);
      setHistory(cached.history);
    } else {
      setLoading(true);
    }

    void loadGitGraphData(folderPath, true)
      .then((data) => {
        if (!active) return;
        setGraph(data.graph);
        setHistory(data.history);
      })
      .catch((err) => {
        if (active) console.error("failed to load Git graph:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [folderPath]);

  useEffect(() => {
    if (!folderPath) return;
    const dispose = window.axon.onGitChanged((event) => {
      if (event?.folderPath && event.folderPath !== folderPath) return;
      // Working-tree edits carry `paths`; HEAD and ref updates do not. Only ref
      // changes (checkout, commit, rebase) reload the graph, otherwise an
      // autosave would reset the panel while the user is inspecting a commit.
      if (event?.paths && event.paths.length > 0) return;
      invalidateGitGraphData(folderPath);
      void refresh(true);
    });
    return dispose;
    return dispose;
  }, [folderPath, refresh]);

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
    ? (historyByHash.get(selectedHash) ??
      detailByHash.get(selectedHash) ??
      null)
    : null;

  useEffect(() => {
    if (!folderPath || !selectedHash) return;
    // The shared history only covers the checked-out branch, but the graph draws
    // every branch. Fetch the file list for the clicked node when it is not in
    // that history, then keep it in a local map so re-selecting is instant.
    if (historyByHash.has(selectedHash) || detailByHash.has(selectedHash)) {
      return;
    }

    let active = true;
    setLoadingDetail(true);
    window.axon
      .getGitCommitDetail(folderPath, selectedHash)
      .then((detail) => {
        if (!active || !detail) return;
        setDetailByHash((current) =>
          new Map(current).set(selectedHash, detail),
        );
      })
      .catch((err) => {
        if (active) console.error("failed to load commit details:", err);
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [folderPath, selectedHash, historyByHash, detailByHash]);

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
            onClick={() =>
              void refresh(true).catch((err) =>
                console.error("failed to refresh Git graph:", err),
              )
            }
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
        className={`grid min-h-0 flex-1 overflow-hidden ${selectedCommit || loadingDetail ? "grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col ${selectedCommit || loadingDetail ? "border-r border-[var(--axon-panel-border)]" : ""}`}
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
        {selectedCommit || loadingDetail ? (
          <CommitDetails
            commit={selectedCommit}
            loading={loadingDetail && !selectedCommit}
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
