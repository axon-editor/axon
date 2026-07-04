import { useEffect, useMemo, useState } from "react";
import { FolderTree, Play, RefreshCw, Square, X } from "lucide-react";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestItem,
  type TestOutputEvent,
  type TestProvider,
} from "@axon-editor/shared/tests";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import TestExplorerDetails from "./TestExplorerDetails";
import TestExplorerOutput from "./TestExplorerOutput";
import { createTestingWorkbenchApi } from "./lib/testingWorkbenchApi";
import {
  formatDuration,
  isEventInsideWorkspace,
  runKeyFor,
  type OutputFilter,
  type RunRecord,
} from "./TestExplorerPrimitives";
import TestExplorerSidebar from "./TestExplorerSidebar";

const testingApi = createTestingWorkbenchApi();

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
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
    const result = await testingApi.discover(folderPath);
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
    const cleanupOutput = testingApi.onOutput((event) => {
      if (!isEventInsideWorkspace(event, folderPath)) return;
      setOutput((current) => [...current.slice(-499), event]);
    });
    const cleanupFinished = testingApi.onFinished(
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
    const result = await testingApi.run(
      folderPath,
      provider.id,
      target?.id ?? null,
    );
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
    const result = await testingApi.stopAll();
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

        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
          <TestExplorerSidebar
            activeRunCount={activeRunCount}
            discovery={discovery}
            expandedProviders={expandedProviders}
            filteredProviders={filteredProviders}
            folderPath={folderPath}
            providerItems={providerItems}
            query={query}
            runStats={runStats}
            runs={runs}
            selectedProvider={selectedProvider}
            selectedTarget={selectedTarget}
            onQueryChange={setQuery}
            onRunProvider={(provider, target) => void runProvider(provider, target)}
            onSelectProvider={selectProvider}
            onSelectTarget={selectTarget}
            onToggleProvider={toggleProvider}
          />

          <section className="flex min-h-0 min-w-0 flex-col bg-[var(--axon-editor-background)]">
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
              <TestExplorerDetails
                activeRunCount={activeRunCount}
                selectedProvider={selectedProvider}
                selectedRun={selectedRun}
                selectedTarget={selectedTarget}
                onRunSelected={() =>
                  selectedProvider && void runProvider(selectedProvider, selectedTarget)
                }
              />
              <TestExplorerOutput
                outputFilter={outputFilter}
                visibleOutput={visibleOutput}
                onOutputFilterChange={setOutputFilter}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
