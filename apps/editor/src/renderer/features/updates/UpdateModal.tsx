import { Download, ExternalLink, X } from "lucide-react";
import {
  type UpdateInfo,
  type UpdateInstallState,
} from "../../../shared/updates";
import MarkdownPreview from "../preview/MarkdownPreview";
import Tooltip from "../../shared/components/Tooltip";

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  installState: UpdateInstallState;
  onClose: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onOpenUpdatePage: () => void;
}

export default function UpdateModal({
  updateInfo,
  installState,
  onClose,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenUpdatePage,
}: UpdateModalProps) {
  const notes =
    updateInfo.releaseNotes.trim() ||
    `## Axon ${updateInfo.latestVersion}\n\nNo release notes were provided.`;
  const downloading = installState.phase === "downloading";
  const downloaded = installState.phase === "downloaded";
  const installing = installState.phase === "installing";
  const checking = installState.phase === "checking";
  const failed = installState.phase === "error";
  const progress = Math.max(0, Math.min(100, installState.percent ?? 0));
  const statusMessage = installState.message;

  // The modal intentionally renders one primary action at a time. Before the
  // package is downloaded, the action starts the updater. After the package is
  // ready, the same visual slot becomes Restart so the user does not have to
  // interpret multiple competing update buttons.
  return (
    <div className="axon-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="axon-modal-panel flex h-[calc(100vh-3rem)] max-h-[780px] min-h-[min(620px,calc(100vh-3rem))] w-[min(920px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--axon-syntax-function)]">
              update available
            </div>
            <div className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
              Axon {updateInfo.latestVersion}
            </div>
            <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
              {updateInfo.currentVersion} {"->"} {updateInfo.latestVersion}
            </div>
            {statusMessage ? (
              <div className="mt-1 max-w-[520px] truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
                {statusMessage}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {downloaded || installing ? (
              <button
                type="button"
                onClick={onInstallUpdate}
                disabled={installing}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-2.5 text-[11px] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={12} />
                {installing ? "Restarting..." : "Restart to Update"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDownloadUpdate}
                disabled={checking || downloading || installing}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-2.5 text-[11px] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={12} />
                {downloading ? `${Math.round(progress)}%` : "Update"}
              </button>
            )}
            {failed ? (
              <button
                type="button"
                onClick={onOpenUpdatePage}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:border-[var(--axon-syntax-function)] hover:text-[var(--axon-editor-foreground)]"
              >
                <ExternalLink size={11} />
                GitHub
              </button>
            ) : null}
            <Tooltip label="Close update notes" side="left">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close update notes"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>
        </div>

        {downloading ? (
          <div className="h-1 shrink-0 bg-[#0b0e14]">
            <div
              className="h-full bg-[#80c8e0] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <MarkdownPreview
            content={notes}
            filePath={`axon-release-${updateInfo.latestVersion}.md`}
            folderPath={null}
          />
        </div>
      </div>
    </div>
  );
}
