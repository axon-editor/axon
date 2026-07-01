import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  type GitCommitDiffResult,
  type GitFileState,
  type GitHistoryCommit,
  type GitHistoryFile,
  type GitHistoryResult,
} from "../../../../shared/git";

const stateLabels: Record<GitFileState, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
  ignored: "I",
  unknown: "?",
};

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

function resolveAuthorAvatarUrl(commit: GitHistoryCommit) {
  if (commit.authorAvatarUrl) {
    return commit.authorAvatarUrl;
  }

  const maybeGitHubUsername = commit.authorName.trim();
  const isGitHubUsername =
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(maybeGitHubUsername);

  if (!isGitHubUsername) {
    return null;
  }

  // Git history often has only the author name and email. When the name is a
  // valid GitHub username, the public avatar endpoint gives the history panel a
  // richer identity without needing API calls. Regular names like "Jane Doe"
  // must stay on initials, otherwise the UI would waste requests on invalid
  // avatar URLs and show broken images.
  return `https://github.com/${maybeGitHubUsername}.png?size=80`;
}

function AuthorAvatar({
  commit,
  large,
}: {
  commit: GitHistoryCommit;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    commit.authorName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  const sizeClass = large ? "h-11 w-11 text-[13px]" : "h-8 w-8 text-[11px]";
  const avatarUrl = resolveAuthorAvatarUrl(commit);

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={commit.authorName}
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-[var(--axon-sidebar-border)] bg-[var(--axon-sidebar-hover-background)] object-cover`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-[var(--axon-sidebar-border)] bg-[var(--axon-sidebar-hover-background)] font-medium text-[#80c8e0]`}
    >
      {initials}
    </span>
  );
}

interface Props {
  folderPath: string | null;
  onOpenCommitFile: (
    commit: GitHistoryCommit,
    file: GitHistoryFile,
    diff: GitCommitDiffResult,
  ) => void;
}

export default function GitHistoryView({
  folderPath,
  onOpenCommitFile,
}: Props) {
  const [history, setHistory] = useState<GitHistoryResult | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<GitHistoryCommit | null>(
    null,
  );
  const [loadingFileKey, setLoadingFileKey] = useState<string | null>(null);

  useEffect(() => {
    if (!folderPath) {
      setHistory(null);
      setSelectedCommit(null);
      return;
    }

    setLoadingHistory(true);
    window.axon
      .getGitHistory(folderPath)
      .then((nextHistory) => {
        setHistory(nextHistory);
        setSelectedCommit((currentCommit) => {
          if (!currentCommit) return null;
          return (
            nextHistory.commits.find(
              (commit) => commit.hash === currentCommit.hash,
            ) ?? null
          );
        });
      })
      .catch(() => {
        setHistory({
          isRepository: false,
          root: null,
          branch: null,
          commits: [],
        });
      })
      .finally(() => setLoadingHistory(false));
  }, [folderPath]);

  const openCommitFile = async (
    commit: GitHistoryCommit,
    file: GitHistoryFile,
  ) => {
    if (!folderPath) return;

    const fileKey = `${commit.hash}:${file.path}`;
    setLoadingFileKey(fileKey);
    try {
      const diff = await window.axon.getGitCommitDiff(
        folderPath,
        commit.hash,
        file.path,
        file.oldPath,
      );
      onOpenCommitFile(commit, file, diff);
    } finally {
      setLoadingFileKey(null);
    }
  };

  const isCommitOpen = selectedCommit !== null;

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className={`absolute inset-0 overflow-y-auto py-2 transition-transform duration-300 ease-out ${
          isCommitOpen ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        {!folderPath && (
          <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            Open a folder to inspect Git history.
          </div>
        )}

        {folderPath && loadingHistory && (
          <div className="space-y-2 px-3 py-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex gap-2 rounded-md px-1 py-1.5">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--axon-sidebar-hover-background)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--axon-sidebar-hover-background)]" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-[var(--axon-sidebar-hover-background)] opacity-70" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-[var(--axon-sidebar-hover-background)] opacity-70" />
                </div>
              </div>
            ))}
          </div>
        )}

        {folderPath && history && !history.isRepository && (
          <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            This workspace is not a Git repository.
          </div>
        )}

        {history?.isRepository &&
          history.commits.length === 0 &&
          !loadingHistory && (
            <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
              No commit history found.
            </div>
          )}

        {history?.commits.map((commit) => (
          <button
            key={commit.hash}
            type="button"
            onClick={() => setSelectedCommit(commit)}
            className="grid w-full cursor-pointer grid-cols-[34px_1fr] gap-2 px-3 py-2 text-left text-[var(--axon-editor-foreground)] opacity-72 transition-colors hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
          >
            <AuthorAvatar commit={commit} />
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)] opacity-95">
                {commit.subject}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {commit.authorName} ·{" "}
                {commit.relativeDate || formatCommitDate(commit.date)}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                <span className="font-mono">{commit.shortHash}</span>
                <span>
                  {commit.files.length} file
                  {commit.files.length === 1 ? "" : "s"}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div
        className={`absolute inset-0 flex min-h-0 flex-col bg-[var(--axon-sidebar-background)] transition-transform duration-300 ease-out ${
          isCommitOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedCommit ? (
          <>
            <div className="shrink-0 border-b border-[var(--axon-sidebar-border)] px-3 py-3">
              <button
                type="button"
                onClick={() => setSelectedCommit(null)}
                className="mb-3 flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
              >
                <ArrowLeft size={13} />
                History
              </button>

              <div className="flex items-start gap-3">
                <AuthorAvatar commit={selectedCommit} large />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-5 text-[var(--axon-editor-foreground)]">
                    {selectedCommit.subject}
                  </div>
                  {selectedCommit.body.trim() ? (
                    <div className="mt-1 max-h-20 overflow-y-auto text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-65">
                      {selectedCommit.body.trim()}
                    </div>
                  ) : null}
                  <div className="mt-2 space-y-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                    <div className="truncate">{selectedCommit.authorName}</div>
                    {selectedCommit.authorEmail ? (
                      <div className="truncate">
                        {selectedCommit.authorEmail}
                      </div>
                    ) : null}
                    <div className="font-mono">{selectedCommit.shortHash}</div>
                    <div>{formatCommitDate(selectedCommit.date)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--axon-sidebar-border)] px-3">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-45">
                changed files
              </span>
              <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                {selectedCommit.files.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {selectedCommit.files.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                  No changed file list available for this commit.
                </div>
              ) : (
                selectedCommit.files.map((file) => {
                  const fileKey = `${selectedCommit.hash}:${file.path}`;
                  const loading = loadingFileKey === fileKey;
                  return (
                    <button
                      key={fileKey}
                      type="button"
                      onClick={() => void openCommitFile(selectedCommit, file)}
                      className="grid w-full cursor-pointer grid-cols-[26px_1fr] items-center gap-2 px-3 py-2 text-left text-[var(--axon-editor-foreground)] opacity-72 transition-colors hover:bg-[var(--axon-sidebar-hover-background)] hover:opacity-100"
                    >
                      <span className="rounded bg-[var(--axon-sidebar-hover-background)] px-1.5 py-0.5 text-center text-[10px] text-[var(--axon-syntax-function)]">
                        {stateLabels[file.status]}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px]">
                          {getFileName(file.path)}
                        </span>
                        <span className="block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                          {loading
                            ? "opening diff..."
                            : file.oldPath
                              ? `${file.oldPath} -> ${file.path}`
                              : file.path}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
