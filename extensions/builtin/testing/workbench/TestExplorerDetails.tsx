import { FileCode2, Play } from "lucide-react";
import { type TestItem, type TestProvider } from "@axon-editor/shared/tests";
import {
  RunPill,
  providerRootLabel,
  type RunRecord,
} from "./TestExplorerPrimitives";

interface Props {
  activeRunCount: number;
  selectedProvider: TestProvider | null;
  selectedRun: RunRecord | null;
  selectedTarget: TestItem | null;
  onRunSelected: () => void;
}

export default function TestExplorerDetails({
  activeRunCount,
  selectedProvider,
  selectedRun,
  selectedTarget,
  onRunSelected,
}: Props) {
  return (
    <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[var(--axon-editor-foreground)]">
            <FileCode2
              size={15}
              className="shrink-0 text-[var(--axon-syntax-function)]"
            />
            <span className="truncate">
              {selectedTarget?.label ?? selectedProvider?.label ?? "No test selected"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            <span className="truncate">
              {selectedProvider ? providerRootLabel(selectedProvider) : "No provider"}
            </span>
            <span className="shrink-0 opacity-40">/</span>
            <span className="truncate">
              {selectedTarget?.detail ??
                selectedProvider?.detail ??
                "Select a project, package, file, or script from the explorer."}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RunPill run={selectedRun} />
          <button
            type="button"
            onClick={onRunSelected}
            disabled={!selectedProvider || activeRunCount > 0}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play size={13} />
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
