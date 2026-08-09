import { FileWarning } from "lucide-react";

export function EditorErrorState({
  error,
  filePath,
}: {
  error: string;
  filePath: string;
}) {
  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--axon-editor-background)] px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.28)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]">
            <FileWarning size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
              {fileName}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
              {error}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditorLoadingState() {
  // The first open waits for a real Axon buffer instead of mounting Monaco
  // against its implicit empty one-line model. Tree prefetch normally makes
  // this surface too short to notice, and avoiding the temporary model removes
  // both the visible flash and an orphan Monaco allocation for every file.
  return <div className="h-full w-full bg-[var(--axon-editor-background)]" />;
}
