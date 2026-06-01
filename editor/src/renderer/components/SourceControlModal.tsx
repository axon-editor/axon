import { useEffect, useMemo, useState } from "react";
import { GitBranch, RefreshCw, X } from "lucide-react";
import {
  type GitChange,
  type GitDiffResult,
  type GitFileState,
  type GitStatusResult,
} from "../../shared/git";
import CommandModal from "./CommandModal";
import Tooltip from "./Tooltip";

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

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

function changeLabel(change: GitChange) {
  if (change.indexState !== "unknown" && change.indexState !== "ignored") {
    return stateLabels[change.indexState];
  }
  return stateLabels[change.worktreeState];
}

function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export default function SourceControlModal({
  folderPath,
  open,
  onClose,
  onOpenFile,
  onOutput,
}: Props) {
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [selectedChange, setSelectedChange] = useState<GitChange | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const stagedChanges = useMemo(
    () => status?.changes.filter((change) => change.staged) ?? [],
    [status],
  );
  const unstagedChanges = useMemo(
    () => status?.changes.filter((change) => change.unstaged) ?? [],
    [status],
  );

  const loadStatus = async () => {
    if (!folderPath) return;

    setLoadingStatus(true);
    try {
      const nextStatus = await window.axon.getGitStatus(folderPath);
      setStatus(nextStatus);
      setSelectedChange((currentChange) => {
        if (!currentChange) return nextStatus.changes[0] ?? null;
        return (
          nextStatus.changes.find(
            (change) => change.path === currentChange.path,
          ) ??
          nextStatus.changes[0] ??
          null
        );
      });
      onOutput(
        nextStatus.isRepository
          ? `Git status loaded with ${nextStatus.changes.length} changed file${nextStatus.changes.length === 1 ? "" : "s"}.`
          : "Current workspace is not a Git repository.",
        nextStatus.isRepository ? "success" : "warning",
      );
    } catch (err) {
      console.error("failed to load git status:", err);
      onOutput("Failed to load Git status.", "error");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadStatus();
  }, [open, folderPath]);

  useEffect(() => {
    if (!folderPath || !selectedChange) {
      setDiff(null);
      return;
    }

    setLoadingDiff(true);
    window.axon
      .getGitDiff(
        folderPath,
        selectedChange.path,
        selectedChange.staged,
        selectedChange.indexState === "untracked",
      )
      .then(setDiff)
      .catch((err) => {
        console.error("failed to load git diff:", err);
        setDiff({
          path: selectedChange.path,
          diff: "Failed to load diff.",
        });
      })
      .finally(() => setLoadingDiff(false));
  }, [folderPath, selectedChange]);

  if (!open) return null;

  return (
    <CommandModal title="source control" onClose={onClose} width="w-[980px]">
      <div className="grid h-[min(680px,calc(100vh-10rem))] grid-cols-[320px_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-[#222838]">
          <div className="flex h-10 items-center justify-between border-b border-[#222838] px-3">
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch size={14} className="text-[#80c8e0]" />
              <span className="truncate text-[12px] text-[#c8d0e0]">
                {status?.branch ?? "no repository"}
              </span>
            </div>
            <Tooltip label="Refresh Git status" side="bottom">
              <button
                onClick={() => void loadStatus()}
                aria-label="Refresh Git status"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
              >
                <RefreshCw size={13} />
              </button>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {!folderPath && (
              <div className="px-3 py-2 text-[12px] text-[#586478]">
                Open a folder to inspect Git changes.
              </div>
            )}

            {folderPath && loadingStatus && (
              <div className="px-3 py-2 text-[12px] text-[#586478]">
                loading git status...
              </div>
            )}

            {folderPath && status && !status.isRepository && (
              <div className="px-3 py-2 text-[12px] text-[#586478]">
                This workspace is not a Git repository.
              </div>
            )}

            {status?.isRepository && status.changes.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-[#586478]">
                No changed files.
              </div>
            )}

            {stagedChanges.length > 0 && (
              <ChangeGroup
                title="staged"
                changes={stagedChanges}
                selectedPath={selectedChange?.path ?? null}
                onSelect={setSelectedChange}
                onOpenFile={onOpenFile}
              />
            )}

            {unstagedChanges.length > 0 && (
              <ChangeGroup
                title="changes"
                changes={unstagedChanges}
                selectedPath={selectedChange?.path ?? null}
                onSelect={setSelectedChange}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex h-10 items-center justify-between border-b border-[#222838] px-3">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-[#c8d0e0]">
                {selectedChange
                  ? getFileName(selectedChange.path)
                  : "No file selected"}
              </div>
              <div className="truncate text-[10px] text-[#586478]">
                {selectedChange?.path ?? "Select a changed file to preview its diff"}
              </div>
            </div>
            <Tooltip label="Close source control" side="bottom">
              <button
                onClick={onClose}
                aria-label="Close source control"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#080a10]">
            {loadingDiff && (
              <div className="px-4 py-3 text-[12px] text-[#586478]">
                loading diff...
              </div>
            )}
            {!loadingDiff && !selectedChange && (
              <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[#586478]">
                Select a changed file to view diff context.
              </div>
            )}
            {!loadingDiff && selectedChange && (
              <pre className="min-h-full whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-5 text-[#9aa4b8]">
                {diff?.diff.trim() ||
                  "No textual diff available for this file."}
              </pre>
            )}
          </div>
        </div>
      </div>
    </CommandModal>
  );
}

function ChangeGroup({
  title,
  changes,
  selectedPath,
  onSelect,
  onOpenFile,
}: {
  title: string;
  changes: GitChange[];
  selectedPath: string | null;
  onSelect: (change: GitChange) => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[#586478]">
        {title} {changes.length}
      </div>
      {changes.map((change) => {
        const selected = change.path === selectedPath;
        return (
          <button
            key={`${title}:${change.path}`}
            onClick={() => onSelect(change)}
            onDoubleClick={() => onOpenFile(change.absolutePath)}
            className={`grid w-full cursor-pointer grid-cols-[24px_1fr] items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              selected
                ? "bg-[#1e2430] text-white"
                : "text-[#9aa4b8] hover:bg-[#14161e] hover:text-white"
            }`}
          >
            <span className="rounded bg-[#151923] px-1.5 py-0.5 text-center text-[10px] text-[#80c8e0]">
              {changeLabel(change)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px]">
                {getFileName(change.path)}
              </span>
              <span className="block truncate text-[10px] text-[#586478]">
                {change.path}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
