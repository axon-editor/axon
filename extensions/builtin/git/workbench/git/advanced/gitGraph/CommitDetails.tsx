import { useMemo } from "react";
import { CalendarDays, ExternalLink, GitCommitHorizontal } from "lucide-react";
import { type GitHistoryCommit } from "@axon-editor/shared/git";
import CommitAuthorAvatar from "./CommitAuthorAvatar";
import CommitFileTree from "./CommitFileTree";
import { buildGitGraphFileTree } from "./gitGraphTree";

export default function CommitDetails({
  commit,
  onOpenFile,
}: {
  commit: GitHistoryCommit | null;
  onOpenFile: (file: GitHistoryCommit["files"][number]) => void;
}) {
  const tree = useMemo(
    () => buildGitGraphFileTree(commit?.files ?? []),
    [commit],
  );

  if (!commit)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-40">
        Select a commit to inspect its details and changed files.
      </div>
    );
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="border-b border-[var(--axon-panel-border)] p-4">
        <div className="flex items-center gap-3">
          <CommitAuthorAvatar commit={commit} className="h-10 w-10" />
          <div className="min-w-0">
            {commit.authorProfileUrl ? (
              <button
                type="button"
                onClick={() =>
                  void window.axon.openExternalLink(commit.authorProfileUrl)
                }
                className="flex max-w-full cursor-pointer items-center gap-1.5 truncate text-[13px] font-medium text-[var(--axon-editor-foreground)] hover:underline"
              >
                <span className="truncate">{commit.authorName}</span>
                <ExternalLink size={10} className="shrink-0 opacity-45" />
              </button>
            ) : (
              <div className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                {commit.authorName}
              </div>
            )}
            <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
              {commit.authorEmail}
            </div>
          </div>
        </div>
      </div>
      <div className="border-b border-[var(--axon-panel-border)] p-4">
        <div className="text-[13px] font-medium leading-5 text-[var(--axon-editor-foreground)]">
          {commit.subject}
        </div>
        {commit.body ? (
          <div className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
            {commit.body}
          </div>
        ) : null}
        <div className="mt-4 grid gap-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-50">
          <div className="flex items-center gap-2">
            <CalendarDays size={12} />
            {commit.date}
          </div>
          <div className="flex items-center gap-2 font-mono">
            <GitCommitHorizontal size={12} />
            {commit.shortHash}
          </div>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-4 text-[10px] uppercase text-[var(--axon-editor-foreground)] opacity-50">
        <span>Changed files</span>
        <span>{commit.files.length}</span>
      </div>
      <div className="py-1">
        <CommitFileTree
          nodes={tree}
          onOpenFile={(node) => node.file && onOpenFile(node.file)}
        />
      </div>
    </div>
  );
}
