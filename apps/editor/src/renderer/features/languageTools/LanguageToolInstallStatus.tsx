import {
  Check,
  Download,
  PackageOpen,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  isManagedLanguageToolProgressActive,
  type ManagedLanguageToolId,
  type ManagedLanguageToolProgress,
} from "../../../shared/languageTools";
import Tooltip from "../../shared/components/Tooltip";
import type { ManagedLanguageToolInstallations } from "./useManagedLanguageToolInstallations";

interface Props {
  installations: ManagedLanguageToolInstallations;
  hiddenToolId?: ManagedLanguageToolId | null;
}

function progressLabel(progress: ManagedLanguageToolProgress) {
  if (progress.message) return progress.message;
  if (progress.phase === "downloading") return "Downloading";
  if (progress.phase === "verifying") return "Verifying download";
  if (progress.phase === "extracting") return "Extracting package";
  if (progress.phase === "installing") return "Finalizing installation";
  if (progress.phase === "cancelling") return "Cancelling";
  if (progress.phase === "installed") return "Installed";
  if (progress.phase === "cancelled") return "Cancelled";
  if (progress.phase === "error") return progress.message ?? "Install failed";
  return "Resolving package";
}

function StatusIcon({ progress }: { progress: ManagedLanguageToolProgress }) {
  if (progress.phase === "installed") return <Check size={12} />;
  if (progress.phase === "error") return <TriangleAlert size={12} />;
  if (progress.phase === "extracting" || progress.phase === "installing") {
    return <PackageOpen size={12} />;
  }
  return <Download size={12} />;
}

export default function LanguageToolInstallStatus({
  installations,
  hiddenToolId,
}: Props) {
  const visibleProgress = installations.progress.filter(
    (progress) => progress.id !== hiddenToolId,
  );
  if (visibleProgress.length === 0) return null;

  return (
    <div className="fixed bottom-7 right-3 z-[75] flex w-[min(330px,calc(100vw-1.5rem))] flex-col gap-1.5">
      {visibleProgress.map((progress) => {
        const active = isManagedLanguageToolProgressActive(progress);
        const percent = progress.percent;
        return (
          <div
            key={progress.id}
            className="overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-lg"
          >
            <div className="flex h-10 items-center gap-2 px-2.5 text-[var(--axon-editor-foreground)]">
              <span className="text-[var(--axon-syntax-function)]">
                <StatusIcon progress={progress} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-medium">
                  {progress.label ?? progress.id}
                </div>
                <div className="truncate text-[9px] opacity-55">
                  {progressLabel(progress)}
                </div>
              </div>
              {typeof percent === "number" && active ? (
                <span className="text-[9px] tabular-nums opacity-50">
                  {Math.round(percent)}%
                </span>
              ) : null}
              <Tooltip
                label={active ? "Cancel installation" : "Dismiss"}
                side="left"
              >
                <button
                  type="button"
                  aria-label={active ? "Cancel installation" : "Dismiss"}
                  onClick={() =>
                    active
                      ? void installations.cancel(progress.id)
                      : installations.dismiss(progress.id)
                  }
                  disabled={progress.phase === "cancelling"}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-45 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  {active ? <Square size={9} /> : <X size={11} />}
                </button>
              </Tooltip>
            </div>
            {active ? (
              <div className="h-0.5 bg-[var(--axon-panel-overlay-hover)]">
                <div
                  className={`h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150 ${
                    typeof percent === "number" ? "" : "animate-pulse"
                  }`}
                  style={{
                    width: typeof percent === "number" ? `${percent}%` : "100%",
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
