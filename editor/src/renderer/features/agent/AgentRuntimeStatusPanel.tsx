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
  if (loading) return "border-[#334155] bg-[#101722] text-[#b8c7dd]";
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
    <div className="mb-4 overflow-hidden rounded-md border border-[#243047] bg-[#0d121b] shadow-sm shadow-black/20">
      <div className="border-b border-[#1d2432] bg-[#101722] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#edf3ff]">
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
            <div className="mt-1 text-[11px] leading-5 text-[#8d98aa]">
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
      <div className="grid grid-cols-3 gap-px bg-[#1d2432]">
        <div className="bg-[#0b1018] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
            Model
          </div>
          <div className="mt-1 truncate text-[11px] text-[#dce4f0]">
            {selectedModelLabel}
          </div>
        </div>
        <div className="bg-[#0b1018] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
            Problems
          </div>
          <div className="mt-1 text-[11px] text-[#dce4f0]">
            {diagnosticsCount}
          </div>
        </div>
        <div className="bg-[#0b1018] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
            Changes
          </div>
          <div className="mt-1 text-[11px] text-[#dce4f0]">
            {gitChangeCount}
          </div>
        </div>
      </div>
      {runtimeStatus?.installHint ? (
        <div className="border-t border-[#1d2432] bg-[#091018] px-4 py-3 text-[11px] leading-5 text-[#c8d0e0]">
          {runtimeStatus.installHint}
        </div>
      ) : null}
      {runtimeStatus?.installed && runtimeStatus.running && !selectedModelInstalled ? (
        <div className="border-t border-[#1d2432] p-4">
          <div className="mb-3 rounded border border-[#20283a] bg-[#090d13] p-3">
            <div className="text-[12px] font-semibold text-[#edf3ff]">
              {selectedModelLabel}
            </div>
            {selectedModelInfo?.description ? (
              <div className="mt-1 text-[11px] leading-5 text-[#8d98aa]">
                {selectedModelInfo.description}
              </div>
            ) : null}
          </div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] text-[#9aa4b8]">
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
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded bg-[#1f5262] px-3 text-[12px] font-medium text-white hover:bg-[#28687c] disabled:cursor-default disabled:opacity-50"
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
            <div className="rounded border border-[#222838] bg-[#080b10] p-2">
              <div className="flex items-center justify-between text-[10px] text-[#647086]">
                <span className="truncate">
                  {pullEvent.error ?? pullEvent.status ?? "Preparing..."}
                </span>
                <span>{pullPercent > 0 ? `${pullPercent}%` : ""}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-[#151b27]">
                <div
                  className="h-full bg-[#80c8e0] transition-all"
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
