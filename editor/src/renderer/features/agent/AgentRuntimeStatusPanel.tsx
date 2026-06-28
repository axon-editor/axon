import { Download, LoaderCircle, Square } from "lucide-react";
import {
  type AiModelInfo,
  type AiPullEvent,
  type AiRuntimeStatus,
} from "../../../shared/ai";

interface Props {
  diagnosticsCount: number;
  gitChangeCount: number;
  modelStatus: string;
  pulling: boolean;
  pullEvent: AiPullEvent | null;
  pullPercent: number;
  runtimeLoading: boolean;
  runtimeStatus: AiRuntimeStatus | null;
  selectedModelInfo?: AiModelInfo;
  selectedModelInstalled: boolean;
  selectedModelLabel: string;
  onCancelPull: () => void;
  onPullSelectedModel: () => void;
}

function statusTone(ready: boolean, loading: boolean) {
  if (loading) {
    return "border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]";
  }
  if (ready) return "border-[#1f5f4a] bg-[#0f221c] text-[#8ff0bf]";
  return "border-[#62412c] bg-[#20170f] text-[#ffbf87]";
}

export default function AgentRuntimeStatusPanel({
  diagnosticsCount,
  gitChangeCount,
  modelStatus,
  pulling,
  pullEvent,
  pullPercent,
  runtimeLoading,
  runtimeStatus,
  selectedModelInfo,
  selectedModelInstalled,
  selectedModelLabel,
  onCancelPull,
  onPullSelectedModel,
}: Props) {
  return (
    <div className="mb-4 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-sm shadow-black/20">
      <div className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--axon-editor-foreground)]">
              {runtimeLoading
                ? "Checking Axon models"
                : runtimeStatus?.installed === false
                  ? "Axon models engine missing"
                  : runtimeStatus?.running === false
                    ? "Axon models engine is not running"
                    : selectedModelInstalled
                      ? `${selectedModelLabel} is ready`
                      : `${selectedModelLabel} needs download`}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
              {runtimeStatus?.detail ?? modelStatus}
            </div>
          </div>
          <div
            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${statusTone(
              selectedModelInstalled,
              runtimeLoading,
            )}`}
          >
            {runtimeLoading
              ? "Checking"
              : selectedModelInstalled
                ? "Ready"
                : "Action needed"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-[var(--axon-panel-border)]">
        <div className="bg-[var(--axon-panel-background)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
            Model
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)]">
            {selectedModelLabel}
          </div>
        </div>
        <div className="bg-[var(--axon-panel-background)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
            Problems
          </div>
          <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)]">
            {diagnosticsCount}
          </div>
        </div>
        <div className="bg-[var(--axon-panel-background)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
            Changes
          </div>
          <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)]">
            {gitChangeCount}
          </div>
        </div>
      </div>
      {runtimeStatus?.installHint ? (
        <div className="border-t border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-4 py-3 text-[11px] leading-5 text-[var(--axon-editor-foreground)]">
          {runtimeStatus.installHint}
        </div>
      ) : null}
      {runtimeStatus?.installed && runtimeStatus.running && !selectedModelInstalled ? (
        <div className="border-t border-[var(--axon-panel-border)] p-4">
          <div className="mb-3 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-3">
            <div className="text-[12px] font-semibold text-[var(--axon-editor-foreground)]">
              {selectedModelLabel}
            </div>
            {selectedModelInfo?.description ? (
              <div className="mt-1 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
                {selectedModelInfo.description}
              </div>
            ) : null}
          </div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-65">
              Download {selectedModelLabel} to enable chat.
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {pulling ? (
                <button
                  type="button"
                  onClick={onCancelPull}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-[#3a2630] bg-[#1a0f14] px-2.5 text-[12px] font-medium text-[#ff9ca8] hover:bg-[#24151b]"
                >
                  <Square size={11} />
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={onPullSelectedModel}
                disabled={pulling}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] font-medium text-[var(--axon-editor-foreground)] hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-default disabled:opacity-50"
              >
                {pulling ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                {pulling ? "Downloading" : "Download"}
              </button>
            </div>
          </div>
          {pullEvent ? (
            <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                <span className="truncate">
                  {pullEvent.error ?? pullEvent.status ?? "Preparing..."}
                </span>
                <span>{pullPercent > 0 ? `${pullPercent}%` : ""}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--axon-panel-overlay-hover)]">
                <div
                  className="h-full bg-[var(--axon-syntax-function)] transition-all"
                  style={{ width: `${pullPercent > 0 ? pullPercent : 12}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
