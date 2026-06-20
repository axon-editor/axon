import { useEffect, useState } from "react";
import { GitGraph, RefreshCw } from "lucide-react";
import { type GitGraphResult } from "../../../../shared/git";
import Tooltip from "../../../shared/components/Tooltip";

interface Props {
  folderPath: string | null;
}

const laneColors = [
  "#80c8e0",
  "#ffcc66",
  "#90c8a0",
  "#d6a3ff",
  "#ea6c73",
  "#9aa4b8",
];

export default function GitGraphPanel({ folderPath }: Props) {
  const [graph, setGraph] = useState<GitGraphResult | null>(null);

  const refresh = async () => {
    if (!folderPath) {
      setGraph(null);
      return;
    }
    setGraph(await window.axon.getGitGraph(folderPath));
  };

  useEffect(() => {
    void refresh().catch((err) => {
      console.error("failed to load Git graph:", err);
    });
  }, [folderPath]);

  const commits = graph?.commits ?? [];

  return (
    <section className="space-y-2 rounded border border-[#1b2130] bg-[#090c12] p-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase text-[#7a8498]">
          <GitGraph size={12} />
          Graph
          {graph?.branch ? (
            <span className="truncate rounded bg-[#142a36] px-1.5 text-[10px] text-[#80c8e0]">
              {graph.branch}
            </span>
          ) : null}
        </div>
        <Tooltip label="Refresh commit graph" side="bottom">
          <button
            type="button"
            aria-label="Refresh commit graph"
            onClick={() => void refresh()}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] hover:bg-[#151923] hover:text-white"
          >
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>

      <div className="max-h-40 overflow-y-auto rounded border border-[#151923]">
        {commits.slice(0, 40).map((commit) => {
          const color = laneColors[commit.lane % laneColors.length];
          return (
            <div
              key={commit.hash}
              className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-[#151923] px-2 py-1.5 last:border-b-0"
            >
              <div className="relative flex justify-center">
                <span
                  className="mt-1 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] text-[#c8d0e0]">
                  {commit.subject}
                </div>
                <div className="flex min-w-0 gap-1 text-[10px] text-[#586478]">
                  <span>{commit.shortHash}</span>
                  <span>{commit.relativeDate}</span>
                  {commit.refs.slice(0, 2).map((ref) => (
                    <span
                      key={ref}
                      className="max-w-20 truncate rounded bg-[#151923] px-1 text-[#7a8498]"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {commits.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-[#465166]">no commits</div>
        ) : null}
      </div>
    </section>
  );
}
