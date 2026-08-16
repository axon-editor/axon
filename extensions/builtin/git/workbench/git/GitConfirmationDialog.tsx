import { AlertTriangle } from "lucide-react";

interface Props {
  confirmLabel: string;
  description: string;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function GitConfirmationDialog({
  confirmLabel,
  description,
  title,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="axon-modal-overlay fixed inset-0 z-[120] flex items-center justify-center px-4">
      <div className="axon-modal-panel axon-git-modal-panel w-full max-w-sm rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-5 text-[var(--axon-editor-foreground)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--axon-danger-background)] text-[var(--axon-danger-foreground)]">
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">{title}</div>
            <p className="mt-2 text-[12px] leading-5 opacity-65">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-md px-3 text-[12px] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-md border border-[var(--axon-danger-foreground)] bg-[var(--axon-danger-background)] px-3 text-[12px] text-[var(--axon-danger-foreground)] transition-colors hover:bg-[color-mix(in_srgb,var(--axon-danger-foreground)_22%,var(--axon-panel-background))] hover:text-[var(--axon-editor-foreground)]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
