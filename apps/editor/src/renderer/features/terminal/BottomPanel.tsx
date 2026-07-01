import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Copy,
  ListChecks,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { type EditorDiagnostic } from "../diagnostics/lib/diagnostics";
import Tooltip from "../../shared/components/Tooltip";

export type BottomPanelTab = "problems" | "output";
export type OutputEntryLevel = "info" | "success" | "warning" | "error";

export interface OutputEntry {
  id: number;
  time: string;
  level: OutputEntryLevel;
  source: string;
  message: string;
}

interface Props {
  open: boolean;
  activeTab: BottomPanelTab;
  diagnostics: EditorDiagnostic[];
  outputEntries: OutputEntry[];
  onActiveTabChange: (tab: BottomPanelTab) => void;
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
  onRefreshDiagnostics: () => void;
  onClearOutput: () => void;
  onClose: () => void;
}

const tabs: Array<{
  id: BottomPanelTab;
  label: string;
  icon: typeof AlertCircle;
}> = [
  { id: "problems", label: "Problems", icon: AlertCircle },
  { id: "output", label: "Output", icon: ListChecks },
];

export function BottomPanelHeader({
  activeTab,
  diagnostics,
  outputEntries,
  onActiveTabChange,
  onRefreshDiagnostics,
  onClearOutput,
  onClose,
}: Omit<Props, "open">) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onActiveTabChange(tab.id)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[12px] transition-colors ${
              active
                ? "bg-[var(--axon-tab-active-background)] text-white"
                : "text-[#586478] hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#c8d0e0]"
            }`}
          >
            <Icon size={13} />
            {tab.label}
            {tab.id === "problems" && (
              <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[#586478]">
                {diagnostics.length}
              </span>
            )}
            {tab.id === "output" && outputEntries.length > 0 && (
              <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[#586478]">
                {outputEntries.length}
              </span>
            )}
          </button>
        );
      })}

      {activeTab === "problems" && (
        <Tooltip label="Refresh diagnostics" side="top">
          <button
            onClick={onRefreshDiagnostics}
            aria-label="Refresh diagnostics"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-white"
          >
            <RefreshCw size={13} />
          </button>
        </Tooltip>
      )}

      {activeTab === "output" && (
        <Tooltip label="Clear output" side="top">
          <button
            onClick={onClearOutput}
            aria-label="Clear output"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-white"
          >
            <Trash2 size={13} />
          </button>
        </Tooltip>
      )}

      <Tooltip label="Close panel" side="top">
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-white"
        >
          <X size={13} />
        </button>
      </Tooltip>
    </div>
  );
}

function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function getParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileName = getFileName(normalizedPath);
  return normalizedPath.slice(
    0,
    Math.max(0, normalizedPath.length - fileName.length - 1),
  );
}

const severityStyles: Record<EditorDiagnostic["severity"], string> = {
  error: "text-[#ea6c73]",
  warning: "text-[#ffcc66]",
  info: "text-[#80c8e0]",
  hint: "text-[#647086]",
};

const severityLabels: Record<EditorDiagnostic["severity"], string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
  hint: "Hints",
};

const severityIcons: Record<EditorDiagnostic["severity"], string> = {
  error: "bg-[#ea6c73]",
  warning: "bg-[#ffcc66]",
  info: "bg-[#80c8e0]",
  hint: "bg-[#647086]",
};

const outputLevelStyles: Record<OutputEntryLevel, string> = {
  info: "text-[#80c8e0]",
  success: "text-[#90c8a0]",
  warning: "text-[#ffcc66]",
  error: "text-[#ea6c73]",
};

function formatDiagnosticForCopy(diagnostic: EditorDiagnostic) {
  const source = diagnostic.source ? ` source=${diagnostic.source}` : "";
  const code =
    diagnostic.code === undefined ? "" : ` code=${String(diagnostic.code)}`;

  return [
    `${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`,
    `[${diagnostic.severity}${source}${code}]`,
    diagnostic.message,
  ].join(" ");
}

function formatDiagnosticsForCopy(diagnostics: EditorDiagnostic[]) {
  return diagnostics.map(formatDiagnosticForCopy).join("\n");
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

function ProblemsContent({
  diagnostics,
  onOpenDiagnostic,
}: {
  diagnostics: EditorDiagnostic[];
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeSeverity, setActiveSeverity] = useState<
    EditorDiagnostic["severity"] | "all"
  >("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyWithFeedback = async (key: string, text: string) => {
    const copied = await copyProblemsText(text);
    if (!copied) return;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((currentKey) => (currentKey === key ? null : currentKey));
    }, 1400);
  };

  const counts = useMemo(
    () =>
      diagnostics.reduce(
        (nextCounts, diagnostic) => {
          nextCounts[diagnostic.severity] += 1;
          return nextCounts;
        },
        { error: 0, warning: 0, info: 0, hint: 0 },
      ),
    [diagnostics],
  );

  const filteredDiagnostics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return diagnostics.filter((diagnostic) => {
      if (
        activeSeverity !== "all" &&
        diagnostic.severity !== activeSeverity
      ) {
        return false;
      }

      if (!normalizedQuery) return true;
      return [
        diagnostic.path,
        getFileName(diagnostic.path),
        diagnostic.message,
        diagnostic.source ?? "",
        diagnostic.code === undefined ? "" : String(diagnostic.code),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeSeverity, diagnostics, query]);

  const groupedDiagnostics = useMemo(() => {
    const groups = new Map<string, EditorDiagnostic[]>();
    for (const diagnostic of filteredDiagnostics) {
      const existingDiagnostics = groups.get(diagnostic.path) ?? [];
      existingDiagnostics.push(diagnostic);
      groups.set(diagnostic.path, existingDiagnostics);
    }

    return Array.from(groups.entries()).map(([path, fileDiagnostics]) => ({
      path,
      diagnostics: fileDiagnostics,
    }));
  }, [filteredDiagnostics]);

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
            placeholder="Filter problems"
            className="h-7 w-full rounded-md border border-[var(--axon-panel-border)] bg-[#090b10] pl-7 pr-2 text-[12px] text-[#c8d0e0] outline-none transition-colors placeholder:text-[#3f485a] focus:border-[#80c8e0]/50"
          />
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
          {groupedDiagnostics.map((group) => (
            <div
              key={group.path}
              className="border-b border-[var(--axon-panel-border)]/50 last:border-b-0"
            >
              <div className="flex h-8 items-center gap-2 px-3 text-[#c8d0e0]">
                <ChevronDown size={13} className="text-[#586478]" />
                <span className="truncate font-medium">
                  {getFileName(group.path)}
                </span>
                <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 text-[10px] text-[#647086]">
                  {group.diagnostics.length}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[#586478]">
                  {getParentPath(group.path)}
                </span>
              </div>

              {group.diagnostics.map((diagnostic) => (
                <div
                  key={diagnostic.id}
                  className="grid w-full grid-cols-[minmax(0,1fr)_28px] items-start gap-2 px-6 py-1.5 transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenDiagnostic(diagnostic)}
                    className="grid min-w-0 cursor-pointer grid-cols-[18px_96px_minmax(0,1fr)_90px] items-start gap-2 text-left"
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
                          <span className="ml-2">Code {diagnostic.code}</span>
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
          ))}
        </div>
      )}
    </div>
  );
}

export function BottomPanelContent({
  activeTab,
  diagnostics,
  outputEntries,
  onOpenDiagnostic,
}: {
  activeTab: BottomPanelTab;
  diagnostics: EditorDiagnostic[];
  outputEntries: OutputEntry[];
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
}) {
  return (
    <>
      {activeTab === "problems" && (
        <ProblemsContent
          diagnostics={diagnostics}
          onOpenDiagnostic={onOpenDiagnostic}
        />
      )}

      {activeTab === "output" && outputEntries.length === 0 && (
        <div className="h-full overflow-y-auto px-4 py-3 font-mono text-[11px] leading-5 text-[#647086]">
          <div>Axon output panel ready.</div>
          <div className="text-[#3f485a]">
            Build, task, extension, and AI tool logs will appear here.
          </div>
        </div>
      )}

      {activeTab === "output" && outputEntries.length > 0 && (
        <div className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5 text-[#647086]">
          {outputEntries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[72px_90px_1fr] gap-3 border-b border-[var(--axon-panel-border)]/60 py-1 last:border-b-0"
            >
              <span className="text-[#3f485a]">{entry.time}</span>
              <span className={outputLevelStyles[entry.level]}>
                {entry.source}
              </span>
              <span className="min-w-0 text-[#9aa4b8]">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function BottomPanel({
  open,
  activeTab,
  diagnostics,
  outputEntries,
  onActiveTabChange,
  onOpenDiagnostic,
  onRefreshDiagnostics,
  onClearOutput,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="h-56 shrink-0 border-t border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[#9aa4b8]">
      <div className="flex h-9 items-center justify-between border-b border-[var(--axon-panel-border)] px-2">
        <BottomPanelHeader
          activeTab={activeTab}
          diagnostics={diagnostics}
          outputEntries={outputEntries}
          onActiveTabChange={onActiveTabChange}
          onOpenDiagnostic={onOpenDiagnostic}
          onRefreshDiagnostics={onRefreshDiagnostics}
          onClearOutput={onClearOutput}
          onClose={onClose}
        />
      </div>

      <div className="h-[calc(100%-36px)]">
        <BottomPanelContent
          activeTab={activeTab}
          diagnostics={diagnostics}
          outputEntries={outputEntries}
          onOpenDiagnostic={onOpenDiagnostic}
        />
      </div>
    </div>
  );
}
