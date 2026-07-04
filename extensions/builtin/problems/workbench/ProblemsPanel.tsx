import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Search,
} from "lucide-react";
import { type EditorDiagnostic } from "./lib/diagnostics";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import {
  countDiagnosticsBySeverity,
  filterDiagnostics,
  formatDiagnosticForCopy,
  formatDiagnosticsForCopy,
  getFileName,
  getParentPath,
  groupDiagnosticsByFile,
  severityIcons,
  severityLabels,
  severityStyles,
  type ProblemScopeFilter,
  type ProblemSeverityFilter,
} from "./lib/problemPresentation";

interface Props {
  activeFile: string | null;
  diagnostics: EditorDiagnostic[];
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
}

async function copyProblemsText(text: string) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("failed to copy problems:", err);
    return false;
  }
}

export default function ProblemsPanel({
  activeFile,
  diagnostics,
  onOpenDiagnostic,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeSeverity, setActiveSeverity] =
    useState<ProblemSeverityFilter>("all");
  const [scope, setScope] = useState<ProblemScopeFilter>("workspace");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const counts = useMemo(
    () => countDiagnosticsBySeverity(diagnostics),
    [diagnostics],
  );

  const filteredDiagnostics = useMemo(
    () =>
      filterDiagnostics({
        activeFile,
        diagnostics,
        query,
        scope,
        severity: activeSeverity,
      }),
    [activeFile, activeSeverity, diagnostics, query, scope],
  );

  const groupedDiagnostics = useMemo(
    () => groupDiagnosticsByFile(filteredDiagnostics),
    [filteredDiagnostics],
  );

  useEffect(() => {
    if (scope === "current-file" && !activeFile) {
      setScope("workspace");
    }
  }, [activeFile, scope]);

  useEffect(() => {
    setCollapsedFiles((currentCollapsedFiles) => {
      const visiblePaths = new Set(groupedDiagnostics.map((group) => group.path));
      const nextCollapsedFiles = new Set<string>();
      currentCollapsedFiles.forEach((path) => {
        if (visiblePaths.has(path)) nextCollapsedFiles.add(path);
      });
      return nextCollapsedFiles;
    });
  }, [groupedDiagnostics]);

  const copyWithFeedback = async (key: string, text: string) => {
    const copied = await copyProblemsText(text);
    if (!copied) return;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((currentKey) => (currentKey === key ? null : currentKey));
    }, 1400);
  };

  const toggleFile = (path: string) => {
    setCollapsedFiles((currentCollapsedFiles) => {
      const nextCollapsedFiles = new Set(currentCollapsedFiles);
      if (nextCollapsedFiles.has(path)) {
        nextCollapsedFiles.delete(path);
      } else {
        nextCollapsedFiles.add(path);
      }
      return nextCollapsedFiles;
    });
  };

  if (diagnostics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[#586478]">
        No problems in this workspace yet.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px] text-[#9aa4b8]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#586478]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter problems by file, source, code, or message"
            className="h-7 w-full rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] pl-7 pr-2 text-[12px] text-[var(--axon-editor-foreground)] outline-none transition-colors placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 focus:border-[#80c8e0]/50"
          />
        </div>

        <div className="flex shrink-0 items-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-0.5">
          {(["workspace", "current-file"] as const).map((nextScope) => (
            <button
              key={nextScope}
              type="button"
              onClick={() => setScope(nextScope)}
              disabled={nextScope === "current-file" && !activeFile}
              className={`h-6 cursor-pointer rounded px-2 text-[11px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                scope === nextScope
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-90"
              }`}
            >
              {nextScope === "current-file" ? "Current File" : "Workspace"}
            </button>
          ))}
        </div>

        <Tooltip label="Copy visible problems" side="top">
          <button
            type="button"
            onClick={() =>
              void copyWithFeedback(
                "visible",
                formatDiagnosticsForCopy(filteredDiagnostics),
              )
            }
            disabled={filteredDiagnostics.length === 0}
            aria-label="Copy visible problems"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#647086] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#c8d0e0] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#647086]"
          >
            {copiedKey === "visible" ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </Tooltip>

        <div className="flex shrink-0 items-center gap-1">
          {(["all", "error", "warning", "info", "hint"] as const).map(
            (severity) => {
              const active = activeSeverity === severity;
              const count =
                severity === "all"
                  ? diagnostics.length
                  : counts[severity];

              return (
                <button
                  key={severity}
                  type="button"
                  onClick={() => setActiveSeverity(severity)}
                  className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors ${
                    active
                      ? "bg-[var(--axon-tab-active-background)] text-white"
                      : "text-[#647086] hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#c8d0e0]"
                  }`}
                >
                  {severity !== "all" && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${severityIcons[severity]}`}
                    />
                  )}
                  {severity === "all" ? "All" : severityLabels[severity]}
                  <span className="text-[#586478]">{count}</span>
                </button>
              );
            },
          )}
        </div>
      </div>

      {groupedDiagnostics.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-[#586478]">
          No problems match this filter.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {groupedDiagnostics.map((group) => {
            const collapsed = collapsedFiles.has(group.path);
            return (
              <div
                key={group.path}
                className="border-b border-[var(--axon-panel-border)]/50 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggleFile(group.path)}
                  className="grid h-8 w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto_minmax(120px,0.7fr)] items-center gap-2 px-3 text-left text-[#c8d0e0] hover:bg-[var(--axon-panel-overlay-hover)]"
                >
                  {collapsed ? (
                    <ChevronRight size={13} className="text-[#586478]" />
                  ) : (
                    <ChevronDown size={13} className="text-[#586478]" />
                  )}
                  <span className="truncate font-medium">
                    {getFileName(group.path)}
                  </span>
                  <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[#647086]">
                    {group.diagnostics.length}
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-[#586478]">
                    {getParentPath(group.path)}
                  </span>
                </button>

                {!collapsed &&
                  group.diagnostics.map((diagnostic) => (
                    <div
                      key={diagnostic.id}
                      className="grid w-full grid-cols-[minmax(0,1fr)_28px] items-start gap-2 px-6 py-1.5 transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDiagnostic(diagnostic)}
                        className="grid min-w-0 cursor-pointer grid-cols-[18px_86px_minmax(0,1fr)_96px] items-start gap-2 text-left"
                      >
                        <Circle
                          size={8}
                          className={`mt-1.5 fill-current ${severityStyles[diagnostic.severity]}`}
                        />
                        <span
                          className={`font-medium capitalize ${severityStyles[diagnostic.severity]}`}
                        >
                          {diagnostic.severity}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[#c8d0e0]">
                            {diagnostic.message}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#586478]">
                            Line {diagnostic.line}, column {diagnostic.column}
                            {diagnostic.code !== undefined && (
                              <span className="ml-2">
                                Code {diagnostic.code}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="truncate text-right text-[11px] text-[#586478]">
                          {diagnostic.source ?? "lsp"}
                        </span>
                      </button>
                      <Tooltip label="Copy problem" side="top">
                        <button
                          type="button"
                          onClick={() =>
                            void copyWithFeedback(
                              diagnostic.id,
                              formatDiagnosticForCopy(diagnostic),
                            )
                          }
                          aria-label="Copy problem"
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#c8d0e0]"
                        >
                          {copiedKey === diagnostic.id ? (
                            <Check size={12} />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </Tooltip>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
