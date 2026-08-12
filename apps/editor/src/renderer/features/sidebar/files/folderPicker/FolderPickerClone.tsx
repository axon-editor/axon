import { type FormEventHandler } from "react";
import { FolderOpen, GitFork, LoaderCircle } from "lucide-react";
import { type GitCloneProgress } from "../../../../../shared/git";

interface Props {
  cloneError: string | null;
  cloneProgress: GitCloneProgress | null;
  cloning: boolean;
  repositoryUrl: string;
  onRepositoryUrlChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export default function FolderPickerClone({
  cloneError,
  cloneProgress,
  cloning,
  repositoryUrl,
  onRepositoryUrlChange,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-[var(--axon-panel-border)] px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]">
          <GitFork size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">
            Clone a repository
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-xl">
          <label
            htmlFor="axon-clone-repository-url"
            className="text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-55"
          >
            Repository URL
          </label>
          <div className="mt-2 flex h-10 items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 transition-colors focus-within:border-[var(--axon-syntax-function)]">
            <GitFork
              size={14}
              className="shrink-0 text-[var(--axon-editor-foreground)] opacity-35"
            />
            <input
              id="axon-clone-repository-url"
              type="text"
              inputMode="url"
              value={repositoryUrl}
              onChange={(event) => onRepositoryUrlChange(event.target.value)}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={cloning}
              placeholder="https://github.com/owner/project.git"
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-25 disabled:opacity-45"
            />
          </div>

          {cloneError ? (
            <div
              role="alert"
              className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--axon-danger-foreground)_35%,transparent)] bg-[color-mix(in_srgb,var(--axon-danger-foreground)_8%,transparent)] px-3 py-2 text-[11px] leading-5 text-[var(--axon-danger-foreground)]"
            >
              {cloneError}
            </div>
          ) : null}

          {cloning && cloneProgress ? (
            <div
              className="mt-5 border-t border-[var(--axon-panel-border)] pt-4"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <LoaderCircle
                  size={14}
                  className="shrink-0 animate-spin text-[var(--axon-syntax-function)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--axon-editor-foreground)]">
                    <span className="truncate">{cloneProgress.message}</span>
                    {cloneProgress.percent !== null ? (
                      <span className="shrink-0 tabular-nums opacity-55">
                        {cloneProgress.percent}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--axon-panel-overlay-hover)]">
                    <div
                      className={`h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150 ${
                        cloneProgress.percent === null ? "animate-pulse" : ""
                      }`}
                      style={{
                        width:
                          cloneProgress.percent === null
                            ? "32%"
                            : `${cloneProgress.percent}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={cloning || !repositoryUrl.trim()}
              className="flex h-9 min-w-32 cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--axon-syntax-function)] px-4 text-[11px] font-medium text-[var(--axon-editor-background)] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-30"
            >
              {cloning ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <FolderOpen size={13} />
              )}
              {cloning ? "Cloning..." : "Choose destination"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
