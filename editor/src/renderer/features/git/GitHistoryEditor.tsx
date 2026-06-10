import { X } from "lucide-react";
import {
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
} from "../../../shared/git";

function formatCommitDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

interface Props {
  commit: GitHistoryCommit;
  file: GitHistoryFile;
  diff: GitCommitDiffResult;
  onClose: () => void;
}

export default function GitHistoryEditor({
  commit,
  file,
  diff,
  onClose,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--axon-editor-background)]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-4">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-[#dce4f0]">
            {getFileName(file.path)}
          </div>
          <div className="truncate text-[10px] text-[#647086]">
            {commit.shortHash} · {commit.authorName} ·{" "}
            {formatCommitDate(commit.date)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Git history diff"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
        >
          <X size={13} />
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-3">
        <div className="text-[13px] font-medium text-[#dce4f0]">
          {commit.subject}
        </div>
        <div className="mt-1 truncate text-[11px] text-[#647086]">
          {file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}
        </div>
      </div>

      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-[11px] leading-5 text-[#9aa4b8]">
        {diff.diff.trim() || "No diff available for this file."}
      </pre>
    </div>
  );
}
