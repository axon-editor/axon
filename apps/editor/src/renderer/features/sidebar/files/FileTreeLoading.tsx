import { Loader2 } from "lucide-react";

export default function FileTreeLoading() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center bg-[var(--axon-sidebar-background)] px-4">
      <div className="flex w-full max-w-[220px] items-center gap-3 rounded-md border border-[var(--axon-sidebar-border)] bg-[var(--axon-panel-background)] px-3 py-2.5 text-[12px] text-[var(--axon-editor-foreground)] shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
        <Loader2
          size={15}
          className="shrink-0 animate-spin text-[var(--axon-syntax-function)]"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="font-medium leading-4">loading workspace</div>
          <div className="truncate text-[11px] leading-4 opacity-55">
            Reading folders and file states.
          </div>
        </div>
      </div>
    </div>
  );
}
