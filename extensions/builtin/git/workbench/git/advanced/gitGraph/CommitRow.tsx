import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import {
  type GitGraphCommit,
  type GitHistoryCommit,
} from "@axon-editor/shared/git";
import CommitHoverPreview from "./CommitHoverPreview";
import GraphLane from "./GraphLane";
import RefChip from "./RefChip";

export default function CommitRow({
  commit,
  details,
  laneCount,
  selected,
  onSelect,
}: {
  commit: GitGraphCommit;
  details: GitHistoryCommit | null;
  laneCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  const stopPreview = () => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setPreviewPosition(null);
  };

  const schedulePreview = () => {
    if (!details) return;
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      const bounds = rowRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPreviewPosition({
        left: Math.max(
          12,
          Math.min(bounds.right - 360, window.innerWidth - 372),
        ),
        top: Math.min(bounds.bottom + 6, window.innerHeight - 190),
      });
    }, 2_000);
  };

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        onClick={onSelect}
        onMouseEnter={schedulePreview}
        onMouseLeave={stopPreview}
        onFocus={schedulePreview}
        onBlur={stopPreview}
        className={`grid h-[35px] w-full cursor-pointer grid-cols-[110px_minmax(220px,1fr)_120px_130px_72px] items-center border-b border-[var(--axon-panel-border)] px-3 text-left text-[11px] text-[var(--axon-editor-foreground)] ${selected ? "bg-[var(--axon-panel-overlay-hover)]" : "hover:bg-[var(--axon-panel-overlay-hover)]"}`}
      >
        <GraphLane commit={commit} laneCount={laneCount} />
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="truncate">{commit.subject}</span>
          {commit.refs.slice(0, 2).map((ref) => (
            <RefChip key={ref} value={ref} />
          ))}
        </span>
        <span className="truncate opacity-50">{commit.relativeDate}</span>
        <span className="flex min-w-0 items-center gap-1.5 truncate opacity-55">
          <UserRound size={11} />
          {commit.authorName}
        </span>
        <span className="truncate font-mono opacity-45">
          {commit.shortHash}
        </span>
      </button>
      {details && previewPosition ? (
        <CommitHoverPreview commit={details} position={previewPosition} />
      ) : null}
    </>
  );
}
