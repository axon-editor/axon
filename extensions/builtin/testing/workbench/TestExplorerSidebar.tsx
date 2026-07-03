import {
  ChevronDown,
  ChevronRight,
  ListFilter,
  Play,
  Search,
} from "lucide-react";
import {
  type TestDiscoveryResult,
  type TestItem,
  type TestProvider,
} from "@axon-editor/shared/tests";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import {
  EmptyState,
  Metric,
  StatusIcon,
  providerRootLabel,
  runKeyFor,
  statusClassName,
  type RunRecord,
} from "./TestExplorerPrimitives";

interface Props {
  activeRunCount: number;
  discovery: TestDiscoveryResult | null;
  expandedProviders: Set<string>;
  filteredProviders: TestProvider[];
  folderPath: string | null;
  providerItems: (provider: TestProvider) => TestItem[];
  query: string;
  runStats: {
    passed: number;
    failed: number;
    stopped: number;
    running: number;
  };
  runs: Record<string, RunRecord>;
  selectedProvider: TestProvider | null;
  selectedTarget: TestItem | null;
  onQueryChange: (query: string) => void;
  onRunProvider: (provider: TestProvider, target?: TestItem | null) => void;
  onSelectProvider: (provider: TestProvider) => void;
  onSelectTarget: (provider: TestProvider, item: TestItem) => void;
  onToggleProvider: (providerId: string) => void;
}

export default function TestExplorerSidebar({
  activeRunCount,
  discovery,
  expandedProviders,
  filteredProviders,
  folderPath,
  providerItems,
  query,
  runStats,
  runs,
  selectedProvider,
  selectedTarget,
  onQueryChange,
  onRunProvider,
  onSelectProvider,
  onSelectTarget,
  onToggleProvider,
}: Props) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--axon-panel-border)]">
      <div className="shrink-0 border-b border-[var(--axon-panel-border)] p-3">
        <div className="flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2.5 py-2">
          <Search
            size={13}
            className="text-[var(--axon-editor-foreground)] opacity-35"
          />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter projects, packages, scripts..."
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30"
          />
          <ListFilter
            size={13}
            className="text-[var(--axon-editor-foreground)] opacity-25"
          />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">
          <Metric
            label="running"
            value={runStats.running}
            tone="text-[var(--axon-syntax-function)]"
          />
          <Metric label="passed" value={runStats.passed} tone="text-[#80d991]" />
          <Metric label="failed" value={runStats.failed} tone="text-[#ff8a8a]" />
          <Metric
            label="stopped"
            value={runStats.stopped}
            tone="text-[#f0c674]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {!folderPath ? (
          <EmptyState
            title="Open a workspace"
            detail="Tests are discovered from project markers inside the workspace."
          />
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
              const selected =
                selectedProvider?.id === provider.id && !selectedTarget;
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
                      onClick={() => onToggleProvider(provider.id)}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                    >
                      {expanded ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProvider(provider)}
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
                        onClick={() => onRunProvider(provider)}
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
                            onClick={() => onSelectTarget(provider, item)}
                            onDoubleClick={() => onRunProvider(provider, item)}
                            className={`grid w-full cursor-pointer grid-cols-[28px_1fr_54px] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${
                              itemSelected
                                ? "bg-[var(--axon-panel-overlay-hover)]"
                                : ""
                            }`}
                          >
                            <span
                              className={statusClassName(
                                itemRun?.status ?? "queued",
                              )}
                            >
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
  );
}
