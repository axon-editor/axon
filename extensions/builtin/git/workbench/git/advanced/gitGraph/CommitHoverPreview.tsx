import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, GitCommitHorizontal, UserRound } from "lucide-react";
import { type GitHistoryCommit } from "@axon-editor/shared/git";

export default function CommitHoverPreview({
  commit,
  position,
}: {
  commit: GitHistoryCommit;
  position: { left: number; top: number };
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return createPortal(
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-[90] w-[min(360px,calc(100vw-24px))] rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3 text-[var(--axon-editor-foreground)] shadow-2xl transition duration-150 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
      style={position}
    >
      <div className="text-[12px] font-medium leading-5">{commit.subject}</div>
      {commit.body ? (
        <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-4 opacity-60">
          {commit.body}
        </div>
      ) : null}
      <div className="mt-3 grid gap-1.5 text-[10px] opacity-50">
        <span className="flex items-center gap-2">
          <UserRound size={11} /> {commit.authorName}
        </span>
        <span className="flex items-center gap-2">
          <CalendarDays size={11} /> {commit.date}
        </span>
        <span className="flex items-center gap-2 font-mono">
          <GitCommitHorizontal size={11} /> {commit.shortHash}
        </span>
      </div>
    </div>,
    document.body,
  );
}
