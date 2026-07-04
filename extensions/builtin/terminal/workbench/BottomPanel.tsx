import {
  AlertCircle,
  ListChecks,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  type BottomPanelTab,
  type OutputEntry,
  type OutputEntryLevel,
} from "@axon-editor/platform/panel/bottomPanel";
import { type EditorDiagnostic } from "@axon-builtin-problems/lib/diagnostics";
import ProblemsPanel from "@axon-builtin-problems/ProblemsPanel";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  open: boolean;
  activeTab: BottomPanelTab;
  activeFile: string | null;
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

const outputLevelStyles: Record<OutputEntryLevel, string> = {
  info: "text-[#80c8e0]",
  success: "text-[#90c8a0]",
  warning: "text-[#ffcc66]",
  error: "text-[#ea6c73]",
};

export function BottomPanelContent({
  activeTab,
  activeFile,
  diagnostics,
  outputEntries,
  onOpenDiagnostic,
}: {
  activeTab: BottomPanelTab;
  activeFile: string | null;
  diagnostics: EditorDiagnostic[];
  outputEntries: OutputEntry[];
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
}) {
  return (
    <>
      {activeTab === "problems" && (
        <ProblemsPanel
          activeFile={activeFile}
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
  activeFile,
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
          activeFile={activeFile}
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
          activeFile={activeFile}
          diagnostics={diagnostics}
          outputEntries={outputEntries}
          onOpenDiagnostic={onOpenDiagnostic}
        />
      </div>
    </div>
  );
}
