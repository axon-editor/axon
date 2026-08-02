import { useEffect, useRef, useState } from "react";
import {
  type GitGraphCommit,
  type GitHistoryCommit,
} from "@axon-editor/shared/git";
import CommitHoverPreview from "./CommitHoverPreview";
import CommitAuthorAvatar from "./CommitAuthorAvatar";
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
  const pointerPositionRef = useRef({ x: 0, y: 0 });
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

  const positionPreview = (x: number, y: number) => {
    const width = Math.min(360, window.innerWidth - 24);
    const estimatedHeight = 190;
    const gap = 12;
    const left =
      window.innerWidth - x - gap >= width ? x + gap : x - width - gap;
    const top =
      window.innerHeight - y - gap >= estimatedHeight
        ? y + gap
        : y - estimatedHeight - gap;
    setPreviewPosition({
      left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
      top: Math.max(
        12,
        Math.min(top, window.innerHeight - estimatedHeight - 12),
      ),
    });
  };

  const schedulePreview = (position?: { x: number; y: number }) => {
    if (!details) return;
    if (position) pointerPositionRef.current = position;
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      const pointer = pointerPositionRef.current;
      if (pointer.x || pointer.y) {
        positionPreview(pointer.x, pointer.y);
        return;
      }
      const bounds = rowRef.current?.getBoundingClientRect();
      if (!bounds) return;
      positionPreview(bounds.left + bounds.width / 2, bounds.bottom);
    }, 2_000);
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (previewPosition) positionPreview(event.clientX, event.clientY);
  };

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        onClick={onSelect}
        onMouseEnter={(event) =>
          schedulePreview({ x: event.clientX, y: event.clientY })
        }
        onMouseMove={handlePointerMove}
        onMouseLeave={stopPreview}
        onFocus={() => {
          pointerPositionRef.current = { x: 0, y: 0 };
          schedulePreview();
        }}
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
          {details ? (
            <CommitAuthorAvatar commit={details} className="h-4 w-4" />
          ) : null}
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
