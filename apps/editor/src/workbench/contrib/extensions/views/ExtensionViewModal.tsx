import { Blocks, ExternalLink, X } from "lucide-react";
import CommandModal from "../../../../renderer/shared/components/CommandModal";
import {
  getWorkbenchExtensionViews,
  type WorkbenchExtensionView,
} from "../lib/extensionViews";
import { type ExtensionState } from "../../../../shared/extensions";

interface Props {
  extensionState: ExtensionState | null;
  viewId: string | null;
  onClose: () => void;
}

function findView(
  extensionState: ExtensionState | null,
  viewId: string | null,
): WorkbenchExtensionView | null {
  if (!viewId) return null;
  return (
    getWorkbenchExtensionViews(extensionState).find((view) => view.id === viewId) ??
    null
  );
}

export default function ExtensionViewModal({
  extensionState,
  viewId,
  onClose,
}: Props) {
  const view = findView(extensionState, viewId);
  if (!view) return null;

  return (
    <CommandModal title="extension view" onClose={onClose} width="w-[720px]">
      <div className="flex h-[min(520px,calc(100vh-96px))] flex-col overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Blocks size={15} className="shrink-0 text-[var(--axon-syntax-function)]" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                {view.title}
              </div>
              <div className="truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                {view.extensionName} / {view.id}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-2 py-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-65">
                {view.location}
              </span>
              <span
                className={`rounded px-2 py-1 text-[10px] ${
                  view.runtimeStatus === "error"
                    ? "bg-[#341b20] text-[#ff8b92]"
                    : view.runtimeRegistered
                      ? "bg-[#152019] text-[#8fe3a2]"
                      : "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-65"
                }`}
              >
                {view.runtimeRegistered ? "runtime registered" : view.runtimeStatus}
              </span>
            </div>

            <div className="mt-4 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-70">
              {view.runtimeMessage}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
              <ExternalLink size={13} className="mt-0.5 shrink-0" />
              <span>
                This view is mounted through Axon&apos;s extension contribution
                registry. Declarative built-in views open their native workbench
                surfaces; runtime extension views land here until the renderer
                view-provider bridge can safely mount extension-owned UI.
              </span>
            </div>
          </div>
        </div>
      </div>
    </CommandModal>
  );
}
