import { useEffect, useMemo, useState } from "react";
import { GitGraph, RefreshCw } from "lucide-react";
import { type GitGraphCommit, type GitGraphResult } from "@axon-editor/shared/git";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  folderPath: string | null;
  variant?: "compact" | "full";
}

const laneColors = [
  "#80c8e0",
  "#ffc777",
  "#32bb99",
  "#9d90fc",
  "#ff757f",
  "#7dcfff",
];

function GraphLane({ commit, laneCount }: { commit: GitGraphCommit; laneCount: number }) {
  const laneWidth = 18;
  const width = Math.max(laneCount, 1) * laneWidth;
  const x = commit.lane * laneWidth + laneWidth / 2;
  const color = laneColors[commit.lane % laneColors.length];

  return (
    <svg width={width} height="42" viewBox={`0 0 ${width} 42`} aria-hidden="true">
      {Array.from({ length: laneCount }).map((_, lane) => {
        const laneX = lane * laneWidth + laneWidth / 2;
        return (
          <line
            key={lane}
            x1={laneX}
            y1="0"
            x2={laneX}
            y2="42"
            stroke={laneColors[lane % laneColors.length]}
            strokeOpacity={lane === commit.lane ? 0.55 : 0.22}
            strokeWidth="1.5"
          />
        );
      })}
      {commit.parents.slice(0, 2).map((_, index) => (
        <path
          key={index}
          d={`M ${x} 21 C ${x + 8 + index * 6} 24, ${x + 8 + index * 6} 32, ${x + 18 + index * 6} 42`}
          fill="none"
          stroke={color}
          strokeOpacity="0.42"
          strokeWidth="1.5"
        />
      ))}
      <circle cx={x} cy="21" r="4.2" fill={color} />
      <circle cx={x} cy="21" r="7" fill={color} opacity="0.14" />
    </svg>
  );
}

export default function GitGraphPanel({ folderPath, variant = "compact" }: Props) {
  const [graph, setGraph] = useState<GitGraphResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!folderPath) {
      setGraph(null);
      return;
    }

    setLoading(true);
    try {
      setGraph(await window.axon.getGitGraph(folderPath));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch((err) => {
      console.error("failed to load Git graph:", err);
    });
  }, [folderPath]);

  const commits = graph?.commits ?? [];
  const visibleCommits = variant === "full" ? commits : commits.slice(0, 30);
  const laneCount = useMemo(
    () =>
      Math.min(
        6,
        Math.max(1, ...visibleCommits.map((commit) => commit.lane + 1)),
      ),
    [visibleCommits],
  );

  return (
    <section
      className={
        variant === "full"
          ? "flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]"
          : "space-y-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-2"
      }
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-65">
          <GitGraph size={12} />
          Graph
          {graph?.branch ? (
            <span className="max-w-36 truncate rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[var(--axon-syntax-function)]">
              {graph.branch}
            </span>
          ) : null}
        </div>
        <Tooltip label="Refresh commit graph" side="bottom">
          <button
            type="button"
            aria-label="Refresh commit graph"
            onClick={() => void refresh()}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </Tooltip>
      </div>

      <div
        className={
          variant === "full"
            ? "min-h-0 flex-1 overflow-auto"
            : "max-h-48 overflow-y-auto rounded border border-[var(--axon-panel-border)]"
        }
      >
        {visibleCommits.map((commit) => (
          <div
            key={commit.hash}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--axon-panel-border)] px-3 py-2 last:border-b-0"
          >
            <GraphLane commit={commit} laneCount={laneCount} />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                {commit.subject}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                <span>{commit.shortHash}</span>
                <span>{commit.authorName}</span>
                <span>{commit.relativeDate}</span>
                {commit.refs.slice(0, variant === "full" ? 4 : 2).map((ref) => (
                  <span
                    key={ref}
                    className="max-w-44 truncate rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-1 text-[var(--axon-editor-foreground)] opacity-80"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            </div>
            {variant === "full" ? (
              <div className="hidden text-[10px] text-[var(--axon-editor-foreground)] opacity-35 md:block">
                {commit.parents.length} parent{commit.parents.length === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        ))}

        {visibleCommits.length === 0 ? (
          <div className="px-3 py-8 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            {graph?.ok === false ? graph.message : "No commits found."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
