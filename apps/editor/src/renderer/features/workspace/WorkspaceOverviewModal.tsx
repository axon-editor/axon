import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FolderKanban, GitBranch, Play, X } from "lucide-react";
import { type EditorDiagnostic } from "../diagnostics/lib/diagnostics";
import { type WorkspaceRoot } from "../../shared/lib/workspaceRoots";

interface RootSummary {
  rootId: string;
  gitBranch: string | null;
  gitChanges: number | null;
  tests: number | null;
}

interface Props {
  open: boolean;
  roots: WorkspaceRoot[];
  activeRootId: string | null;
  diagnostics: EditorDiagnostic[];
  onClose: () => void;
  onSwitchRoot: (path: string) => void | Promise<void>;
  onOpenTests: () => void;
}

function isPathInsideRoot(path: string, rootPath: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

export default function WorkspaceOverviewModal({
  open,
  roots,
  activeRootId,
  diagnostics,
  onClose,
  onSwitchRoot,
  onOpenTests,
}: Props) {
  const [summaries, setSummaries] = useState<Record<string, RootSummary>>({});

  const problemCounts = useMemo(() => {
    const counts = new Map<string, { total: number; errors: number }>();
    for (const root of roots) {
      const rootDiagnostics = diagnostics.filter((diagnostic) =>
        isPathInsideRoot(diagnostic.path, root.path),
      );
      counts.set(root.id, {
        total: rootDiagnostics.length,
        errors: rootDiagnostics.filter(
          (diagnostic) => diagnostic.severity === "error",
        ).length,
      });
    }
    return counts;
  }, [diagnostics, roots]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Multi-root workspaces should give immediate project-level signal without
    // forcing every subsystem to become multi-root in one pass. I query each
    // root through the existing safe preload APIs and store only small summary
    // values here, so the overview stays cheap even when several roots are
    // present.
    void Promise.all(
      roots.map(async (root) => {
        const [gitStatus, testDiscovery] = await Promise.allSettled([
          window.axon.getGitStatus(root.path),
          window.axon.discoverTests(root.path),
        ]);

        return {
          rootId: root.id,
          gitBranch:
            gitStatus.status === "fulfilled" && gitStatus.value.isRepository
              ? gitStatus.value.branch
              : null,
          gitChanges:
            gitStatus.status === "fulfilled" && gitStatus.value.isRepository
              ? gitStatus.value.changes.length
              : null,
          tests:
            testDiscovery.status === "fulfilled" && testDiscovery.value.ok
              ? testDiscovery.value.providers.length
              : null,
        };
      }),
    ).then((nextSummaries) => {
      if (cancelled) return;
      setSummaries(
        Object.fromEntries(
          nextSummaries.map((summary) => [summary.rootId, summary]),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, roots]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="flex max-h-[78vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl">
        <div className="flex h-11 items-center justify-between border-b border-[var(--axon-panel-border)] px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--axon-editor-foreground)]">
            <FolderKanban size={16} />
            Workspace overview
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-2">
            {roots.map((root) => {
              const active = root.id === activeRootId;
              const summary = summaries[root.id];
              const problems = problemCounts.get(root.id) ?? {
                total: 0,
                errors: 0,
              };

              return (
                <div
                  key={root.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border p-3 ${
                    active
                      ? "border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)]"
                      : "border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--axon-editor-foreground)]">
                        {root.name}
                      </span>
                      {active ? (
                        <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[var(--axon-syntax-function)]">
                          active
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
                      {root.path}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-65">
                        <GitBranch size={11} />
                        {summary?.gitBranch ?? "no git"}
                        {summary?.gitChanges !== null &&
                        summary?.gitChanges !== undefined
                          ? ` · ${summary.gitChanges}`
                          : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-65">
                        <AlertCircle size={11} />
                        {problems.total} problems
                        {problems.errors > 0 ? ` · ${problems.errors} errors` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-65">
                        <Play size={11} />
                        {summary?.tests ?? 0} test providers
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[var(--axon-editor-foreground)] opacity-65">
                        <CheckCircle2 size={11} />
                        {root.trusted === false ? "untrusted" : "trusted"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => void onSwitchRoot(root.path)}
                      disabled={active}
                      className="h-7 cursor-pointer rounded border border-[var(--axon-panel-border)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 hover:border-[var(--axon-syntax-function)] hover:opacity-100 disabled:cursor-default disabled:border-[var(--axon-panel-border)] disabled:opacity-35"
                    >
                      switch
                    </button>
                    <button
                      type="button"
                      onClick={onOpenTests}
                      className="h-7 cursor-pointer rounded border border-[var(--axon-panel-border)] px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)]"
                    >
                      tests
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
