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
    <div className="fixed inset-0 z-50 bg-[#05070c]/40 backdrop-blur-[2px]">
      <div className="absolute bottom-8 left-1/2 top-16 flex w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[#2a3042] bg-[#11141d] shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.03]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#222838] bg-[#141824] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#80c8e0]">
              update available
            </div>
            <div className="truncate text-[13px] font-medium text-[#c8d0e0]">
              Axon {updateInfo.latestVersion}
            </div>
            <div className="mt-1 text-[11px] text-[#586478]">
              {updateInfo.currentVersion} {"->"} {updateInfo.latestVersion}
            </div>
            {statusMessage ? (
              <div className="mt-1 max-w-[520px] truncate text-[11px] text-[#7b8496]">
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
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[#2a3346] bg-[#142a36] px-2.5 text-[11px] text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={12} />
                {installing ? "Restarting..." : "Restart to Update"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDownloadUpdate}
                disabled={checking || downloading || installing}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[#2a3346] bg-[#142a36] px-2.5 text-[11px] text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={12} />
                {downloading ? `${Math.round(progress)}%` : "Update"}
              </button>
            )}
            {failed ? (
              <button
                type="button"
                onClick={onOpenUpdatePage}
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[#222838] bg-[#14161e] px-2.5 text-[11px] text-[#9aa4b8] transition-colors hover:border-[#80c8e0] hover:text-white"
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
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#1e2430] hover:text-white"
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
