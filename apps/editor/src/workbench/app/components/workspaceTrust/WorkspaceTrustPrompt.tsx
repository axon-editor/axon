import { getPathBasename } from "../../lib/appPath";

interface WorkspaceTrustPromptProps {
  onReject: () => void;
  onTrust: () => void;
  parentRepositoryRoot: string | null;
  workspacePath: string;
}

export default function WorkspaceTrustPrompt({
  onReject,
  onTrust,
  parentRepositoryRoot,
  workspacePath,
}: WorkspaceTrustPromptProps) {
  const workspaceName = getPathBasename(workspacePath);

  return (
    <div className="axon-modal-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div className="axon-modal-panel w-full max-w-md rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
        <div className="text-[14px] font-medium text-[var(--axon-editor-foreground)]">
          Trust this workspace?
        </div>
        <div className="mt-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
          Axon can run project-aware features for{" "}
          <span className="font-medium text-[var(--axon-editor-foreground)]">
            {workspaceName}
          </span>
          , including language servers, tasks, terminals, and extensions. Only
          trust folders you recognize.
        </div>
        {parentRepositoryRoot && (
          <div className="mt-3 rounded-md border border-[var(--axon-syntax-function)]/35 bg-[var(--axon-panel-overlay-hover)] px-3 py-2.5 text-[11px] leading-5 text-[var(--axon-editor-foreground)]">
            Source Control detected the parent Git repository{" "}
            <span className="font-medium text-[var(--axon-syntax-function)]">
              {getPathBasename(parentRepositoryRoot)}
            </span>
            . Source Control will show, review, stage, discard, and commit
            changes throughout that repository, including files outside{" "}
            {workspaceName}.
            <div className="mt-2 truncate font-mono text-[10px] opacity-50">
              {parentRepositoryRoot}
            </div>
          </div>
        )}
        <div className="mt-3 truncate rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2 font-mono text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
          {workspacePath}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            className="h-8 cursor-pointer rounded-md border border-[var(--axon-panel-border)] px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            Don&apos;t trust
          </button>
          <button
            type="button"
            onClick={onTrust}
            className="h-8 cursor-pointer rounded-md border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:text-[var(--axon-syntax-function)]"
          >
            Trust workspace
          </button>
        </div>
      </div>
    </div>
  );
}
