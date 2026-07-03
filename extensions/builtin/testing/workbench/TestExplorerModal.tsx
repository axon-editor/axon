import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  FileCode2,
  FolderTree,
  ListFilter,
  Play,
  RefreshCw,
  Search,
  Square,
  TerminalSquare,
  X,
  XCircle,
} from "lucide-react";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestItem,
  type TestOutputEvent,
  type TestProvider,
  type TestRunStatus,
} from "@axon-editor/shared/tests";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

interface RunRecord {
  runId: string;
  providerId: string;
  targetId: string | null;
  label: string;
  status: TestRunStatus;
  startedAt: number;
  durationMs: number | null;
  exitCode: number | null;
}

type OutputFilter = "all" | "selected";

function providerRootLabel(provider: TestProvider) {
  return provider.rootPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? provider.label;
}

function statusClassName(status: TestRunStatus) {
  if (status === "passed") return "text-[#80d991]";
  if (status === "failed") return "text-[#ff8a8a]";
  if (status === "stopped") return "text-[#f0c674]";
  if (status === "running") return "text-[var(--axon-syntax-function)]";
  return "text-[var(--axon-editor-foreground)] opacity-35";
}

function StatusIcon({ status }: { status: TestRunStatus }) {
  if (status === "passed") return <CheckCircle2 size={13} />;
  if (status === "failed") return <XCircle size={13} />;
  if (status === "stopped") return <Square size={12} />;
  if (status === "running") return <RefreshCw size={13} className="animate-spin" />;
  return <Circle size={12} />;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "running";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function normalizePathForCompare(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isEventInsideWorkspace(
  event: Pick<TestOutputEvent, "rootPath">,
  folderPath: string | null,
) {
  if (!folderPath) return false;
  const workspaceRoot = normalizePathForCompare(folderPath);
  const eventRoot = normalizePathForCompare(event.rootPath);
  return eventRoot === workspaceRoot || eventRoot.startsWith(`${workspaceRoot}/`);
}

export default function TestExplorerModal({
  folderPath,
  open,
  onClose,
  onOutput,
}: Props) {
  const [discovery, setDiscovery] = useState<TestDiscoveryResult | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [outputFilter, setOutputFilter] = useState<OutputFilter>("selected");
  const [output, setOutput] = useState<TestOutputEvent[]>([]);
  const [runs, setRuns] = useState<Record<string, RunRecord>>({});
  const providers = discovery?.providers ?? [];
  const items = discovery?.items ?? [];
  const activeRunCount = Object.values(runs).filter(
    (run) => run.status === "running" || run.status === "queued",
  ).length;

  const providerItems = (provider: TestProvider): TestItem[] =>
    items.filter((item) => item.providerId === provider.id);

  const runKeyFor = (providerId: string, targetId?: string | null) =>
    targetId ?? providerId;

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0] ??
    null;
  const selectedTarget =
    selectedTargetId && selectedProvider
      ? providerItems(selectedProvider).find((item) => item.id === selectedTargetId) ?? null
      : null;
  const selectedRunKey = selectedProvider
    ? runKeyFor(selectedProvider.id, selectedTarget?.id ?? null)
    : null;
  const selectedRun = selectedRunKey ? runs[selectedRunKey] ?? null : null;

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return providers;

    return providers.filter((provider) => {
      const haystack = [
        provider.label,
        provider.detail,
        provider.kind,
        provider.rootPath,
        ...providerItems(provider).flatMap((item) => [
          item.label,
          item.detail,
          item.kind,
          item.path ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, providers, query]);

  const visibleOutput = useMemo(() => {
    const scopedOutput =
      outputFilter === "all"
        ? output
        : selectedRun
          ? output.filter((event) => event.runId === selectedRun.runId)
          : [];
    return scopedOutput.slice(-300);
  }, [output, outputFilter, selectedRun]);

  const runStats = useMemo(() => {
    const records = Object.values(runs);
    return {
      passed: records.filter((run) => run.status === "passed").length,
      failed: records.filter((run) => run.status === "failed").length,
      stopped: records.filter((run) => run.status === "stopped").length,
      running: records.filter((run) => run.status === "running").length,
    };
  }, [runs]);

  const discover = async () => {
    if (!folderPath) {
      setDiscovery(null);
      setExpandedProviders(new Set());
      setSelectedProviderId(null);
      setSelectedTargetId(null);
      return;
    }

    setDiscovering(true);
    const result = await window.axon.discoverTests(folderPath);
    setDiscovery(result);
    setExpandedProviders(new Set(result.providers.map((provider) => provider.id)));
    setSelectedProviderId((current) => {
      if (current && result.providers.some((provider) => provider.id === current)) {
        return current;
      }
      return result.providers[0]?.id ?? null;
    });
    setSelectedTargetId(null);
    setDiscovering(false);
    onOutput(result.message, result.ok ? "info" : "warning");
  };

  useEffect(() => {
    setDiscovery(null);
    setExpandedProviders(new Set());
    setSelectedProviderId(null);
    setSelectedTargetId(null);
    setOutput([]);
    setRuns({});
    setQuery("");
  }, [folderPath]);

  useEffect(() => {
    if (!open) return;
    void discover().catch((err) => {
      setDiscovering(false);
      console.error("test discovery failed:", err);
      onOutput("Test discovery failed.", "error");
    });
  }, [folderPath, open]);

  useEffect(() => {
    if (!open) return;
    const cleanupOutput = window.axon.onTestOutput((event) => {
      if (!isEventInsideWorkspace(event, folderPath)) return;
      setOutput((current) => [...current.slice(-499), event]);
    });
    const cleanupFinished = window.axon.onTestFinished(
      (event: TestFinishedEvent) => {
        if (!isEventInsideWorkspace(event, folderPath)) return;
        setRuns((current) => {
          const match = Object.entries(current).find(
            ([, run]) => run.runId === event.runId,
          );
          if (!match) return current;

          const [key, run] = match;
          return {
            ...current,
            [key]: {
              ...run,
              status: event.status,
              durationMs: event.durationMs,
              exitCode: event.exitCode,
            },
          };
        });
        onOutput(
          event.exitCode === 0
            ? `${event.label} passed in ${formatDuration(event.durationMs)}.`
            : `${event.label} failed in ${formatDuration(event.durationMs)}.`,
          event.exitCode === 0 ? "success" : "error",
        );
      },
    );
    return () => {
      cleanupOutput();
      cleanupFinished();
    };
  }, [folderPath, onOutput, open]);

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const selectProvider = (provider: TestProvider) => {
    setSelectedProviderId(provider.id);
    setSelectedTargetId(null);
    setExpandedProviders((current) => new Set(current).add(provider.id));
  };

  const selectTarget = (provider: TestProvider, item: TestItem) => {
    setSelectedProviderId(provider.id);
    setSelectedTargetId(item.id);
  };

  const runProvider = async (provider: TestProvider, target?: TestItem | null) => {
    if (!folderPath) return;
    const runKey = runKeyFor(provider.id, target?.id ?? null);
    const label = target?.label ?? provider.label;
    setRuns((current) => ({
      ...current,
      [runKey]: {
        runId: `pending:${runKey}:${Date.now()}`,
        providerId: provider.id,
        targetId: target?.id ?? null,
        label,
        status: "queued",
        startedAt: Date.now(),
        durationMs: null,
        exitCode: null,
      },
    }));
    const result = await window.axon.runTests(folderPath, provider.id, target?.id ?? null);
    onOutput(result.message, result.ok ? "info" : "error");
    setRuns((current) => {
      if (!result.ok || !result.runId) {
        const next = { ...current };
        delete next[runKey];
        return next;
      }
      return {
        ...current,
        [runKey]: {
          ...current[runKey],
          runId: result.runId,
          label: result.label ?? label,
          status: "running",
        },
      };
    });
  };

  const stopRuns = async () => {
    const result = await window.axon.stopTests();
    onOutput(result.message, result.stopped > 0 ? "warning" : "info");
  };

  if (!open) return null;

  return (
    <div className="axon-modal-overlay fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div
        className="axon-modal-panel flex flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        style={{
          width: "min(1180px, calc(100vw - 2rem))",
          height: "min(860px, calc(100vh - 3rem))",
          minHeight: "min(680px, calc(100vh - 3rem))",
        }}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <FolderTree size={15} className="text-[var(--axon-syntax-function)]" />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-75">
                test explorer
              </div>
              <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {folderPath ?? "No workspace open"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip label="Run selected test target" side="bottom">
              <button
                type="button"
                aria-label="Run selected test target"
                onClick={() =>
                  selectedProvider && void runProvider(selectedProvider, selectedTarget)
                }
                disabled={!selectedProvider || activeRunCount > 0}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Play size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Stop active test runs" side="bottom">
              <button
                type="button"
                aria-label="Stop active test runs"
                onClick={() => void stopRuns()}
                disabled={activeRunCount === 0}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[#f0c674] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Square size={13} />
              </button>
            </Tooltip>
            <Tooltip label="Rediscover tests in this workspace" side="bottom">
              <button
                type="button"
                aria-label="Rediscover tests in this workspace"
                onClick={() => void discover()}
                disabled={discovering}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <RefreshCw size={14} className={discovering ? "animate-spin" : ""} />
              </button>
            </Tooltip>
            <Tooltip label="Close test explorer" side="bottom">
              <button
                type="button"
                aria-label="Close test explorer"
                onClick={onClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                <X size={14} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
          <aside className="flex min-h-0 flex-col border-r border-[var(--axon-panel-border)]">
            <div className="shrink-0 border-b border-[var(--axon-panel-border)] p-3">
              <div className="flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2.5 py-2">
                <Search size={13} className="text-[var(--axon-editor-foreground)] opacity-35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter projects, packages, scripts..."
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30"
                />
                <ListFilter size={13} className="text-[var(--axon-editor-foreground)] opacity-25" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">
                <Metric label="running" value={runStats.running} tone="text-[var(--axon-syntax-function)]" />
                <Metric label="passed" value={runStats.passed} tone="text-[#80d991]" />
                <Metric label="failed" value={runStats.failed} tone="text-[#ff8a8a]" />
                <Metric label="stopped" value={runStats.stopped} tone="text-[#f0c674]" />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {!folderPath ? (
                <EmptyState title="Open a workspace" detail="Tests are discovered from project markers inside the workspace." />
              ) : filteredProviders.length === 0 ? (
                <EmptyState
                  title={discovery?.message ?? "No test providers found."}
                  detail="Axon looks for package.json scripts, go.mod, Cargo.toml, pytest.ini, pyproject.toml, and requirements.txt."
                />
              ) : (
                <div className="space-y-2">
                  {filteredProviders.map((provider) => {
                    const expanded = expandedProviders.has(provider.id);
                    const run = runs[runKeyFor(provider.id)];
                    const children = providerItems(provider);
                    const selected = selectedProvider?.id === provider.id && !selectedTarget;
                    return (
                      <div
                        key={provider.id}
                        className="overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]"
                      >
                        <div
                          className={`grid grid-cols-[24px_1fr_28px] items-center gap-2 px-2 py-2 ${
                            selected ? "bg-[var(--axon-panel-overlay-hover)]" : ""
                          }`}
                        >
                          <button
                            type="button"
                            aria-label={expanded ? "Collapse provider" : "Expand provider"}
                            onClick={() => toggleProvider(provider.id)}
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                          >
                            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectProvider(provider)}
                            className="min-w-0 cursor-pointer text-left"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={statusClassName(run?.status ?? "queued")}>
                                <StatusIcon status={run?.status ?? "queued"} />
                              </span>
                              <span className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                                {provider.label}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                              {provider.kind} · {providerRootLabel(provider)}
                            </span>
                          </button>
                          <Tooltip label="Run project tests" side="left">
                            <button
                              type="button"
                              aria-label="Run project tests"
                              onClick={() => void runProvider(provider)}
                              disabled={activeRunCount > 0}
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Play size={13} />
                            </button>
                          </Tooltip>
                        </div>

                        {expanded && children.length > 0 && (
                          <div className="border-t border-[var(--axon-panel-border)]">
                            {children.map((item) => {
                              const itemRun = runs[runKeyFor(provider.id, item.id)];
                              const itemSelected = selectedTarget?.id === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => selectTarget(provider, item)}
                                  onDoubleClick={() => void runProvider(provider, item)}
                                  className={`grid w-full cursor-pointer grid-cols-[28px_1fr_54px] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${
                                    itemSelected ? "bg-[var(--axon-panel-overlay-hover)]" : ""
                                  }`}
                                >
                                  <span className={statusClassName(itemRun?.status ?? "queued")}>
                                    <StatusIcon status={itemRun?.status ?? "queued"} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-[11px] text-[var(--axon-editor-foreground)]">
                                      {item.label}
                                    </span>
                                    <span className="block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
                                      {item.detail}
                                    </span>
                                  </span>
                                  <span className="text-right text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                                    {item.kind}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-[var(--axon-editor-background)]">
            <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                    <FileCode2 size={15} className="text-[var(--axon-syntax-function)]" />
                    <span className="truncate">
                      {selectedTarget?.label ?? selectedProvider?.label ?? "No test selected"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
                    {selectedTarget?.detail ??
                      selectedProvider?.detail ??
                      "Select a project, package, file, or script from the explorer."}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RunPill run={selectedRun} />
                  <button
                    type="button"
                    onClick={() =>
                      selectedProvider && void runProvider(selectedProvider, selectedTarget)
                    }
                    disabled={!selectedProvider || activeRunCount > 0}
                    className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Play size={13} />
                    Run
                  </button>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[180px_minmax(0,1fr)]">
              <div className="grid grid-cols-3 gap-3 border-b border-[var(--axon-panel-border)] p-3">
                <DetailPanel
                  title="Project"
                  value={selectedProvider ? providerRootLabel(selectedProvider) : "none"}
                  detail={selectedProvider?.rootPath ?? "No provider selected."}
                />
                <DetailPanel
                  title="Command"
                  value={selectedTarget?.detail ?? selectedProvider?.detail ?? "none"}
                  detail={selectedProvider?.kind ?? "No command available."}
                />
                <DetailPanel
                  title="Last Run"
                  value={selectedRun?.status ?? "not run"}
                  detail={
                    selectedRun
                      ? `${formatDuration(selectedRun.durationMs)} · exit ${selectedRun.exitCode ?? "pending"}`
                      : "Run this target to collect status and output."
                  }
                />
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-60">
                    <TerminalSquare size={13} />
                    Output
                  </div>
                  <div className="flex items-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-1">
                    {(["selected", "all"] as OutputFilter[]).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setOutputFilter(filter)}
                        className={`h-7 cursor-pointer rounded px-2.5 text-[11px] capitalize transition-colors ${
                          outputFilter === filter
                            ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                            : "text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-90"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5">
                  {visibleOutput.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[var(--axon-editor-foreground)] opacity-35">
                      no test output yet
                    </div>
                  ) : (
                    visibleOutput.map((event, index) => (
                      <div
                        key={`${event.runId}:${index}`}
                        className={
                          event.stream === "stderr"
                            ? "text-[#ff9aa2]"
                            : event.stream === "system"
                              ? "text-[var(--axon-syntax-function)]"
                              : "text-[var(--axon-editor-foreground)] opacity-70"
                        }
                      >
                        {event.line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 py-1.5">
      <div className={`text-[13px] font-medium ${tone}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-35">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Clock3 size={18} className="text-[var(--axon-editor-foreground)] opacity-25" />
      <div className="mt-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65">
        {title}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-40">
        {detail}
      </div>
    </div>
  );
}

function RunPill({ run }: { run: RunRecord | null }) {
  const status = run?.status ?? "queued";
  return (
    <span
      className={`flex h-8 items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 text-[11px] ${statusClassName(status)}`}
    >
      <StatusIcon status={status} />
      {run ? `${status} · ${formatDuration(run.durationMs)}` : "not run"}
    </span>
  );
}

function DetailPanel({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-35">
        {title}
      </div>
      <div className="mt-2 truncate text-[13px] text-[var(--axon-editor-foreground)]">
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
        {detail}
      </div>
    </div>
  );
}
