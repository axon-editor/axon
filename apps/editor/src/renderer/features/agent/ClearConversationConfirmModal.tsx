import { AlertTriangle } from "lucide-react";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ClearConversationConfirmModal(props: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--axon-editor-background)] px-4">
      <div className="axon-modal-panel w-full max-w-sm rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#2a1720] text-[#ff8f8f]">
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[var(--axon-editor-foreground)]">
              Clear conversation?
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
              This removes the selected Ask Axon conversation from this
              workspace. Other conversations are kept.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className="h-8 cursor-pointer rounded-md border border-[#5c2a33] bg-[#2a1720] px-3 text-[12px] text-[#ffb1b1] transition-colors hover:border-[#ff8f8f] hover:text-[var(--axon-editor-foreground)]"
          >
            Clear Conversation
          </button>
        </div>
      </div>
    </div>
  );
}
