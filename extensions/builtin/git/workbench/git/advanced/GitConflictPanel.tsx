import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, GitMerge, RefreshCw } from "lucide-react";
import { type GitConflictListResult } from "@axon-editor/shared/git";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  folderPath: string | null;
  onChanged: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

export default function GitConflictPanel({
  folderPath,
  onChanged,
  onOutput,
}: Props) {
  const [conflicts, setConflicts] = useState<GitConflictListResult | null>(
    null,
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!folderPath) {
      setConflicts(null);
      return;
    }
    const result = await window.axon.listGitConflicts(folderPath);
    setConflicts(result);
  }, [folderPath]);

  useEffect(() => {
    void refresh().catch((err) => {
      console.error("failed to load Git conflicts:", err);
    });
  }, [refresh]);

  const resolveConflict = async (
    path: string,
    type: "ours" | "theirs" | "markResolved",
  ) => {
    if (!folderPath) return;
    setBusyPath(`${type}:${path}`);
    try {
      const result = await window.axon.resolveGitConflict(folderPath, {
        type,
        path,
      });
      onOutput(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        await refresh();
        onChanged();
      }
    } finally {
      setBusyPath(null);
    }
  };

  const conflictItems = conflicts?.conflicts ?? [];

  return (
    <section className="space-y-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase text-[var(--axon-editor-foreground)] opacity-65">
          <GitMerge size={12} />
          Conflicts
          {conflictItems.length > 0 ? (
            <span className="rounded bg-[var(--axon-danger-background)] px-1.5 text-[10px] text-[var(--axon-danger-foreground)]">
              {conflictItems.length}
            </span>
          ) : null}
        </div>
        <Tooltip label="Refresh conflicts" side="bottom">
          <button
            type="button"
            aria-label="Refresh merge conflict list"
            onClick={() => void refresh()}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>

      {conflictItems.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
          <Check size={12} />
          no conflicts
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto">
          {conflictItems.map((conflict) => (
            <div
              key={conflict.path}
              className="border-t border-[var(--axon-panel-border)] px-1 py-2 first:border-t-0"
            >
              <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--axon-editor-foreground)]">
                <AlertTriangle
                  size={12}
                  className="text-[var(--axon-warning-foreground)]"
                />
                <span className="truncate">{conflict.path}</span>
              </div>
              <div className="flex gap-1">
                {(["ours", "theirs", "markResolved"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={busyPath !== null}
                    onClick={() => void resolveConflict(conflict.path, type)}
                    className="h-6 cursor-pointer rounded border border-[var(--axon-panel-border)] px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-70 hover:border-[var(--axon-info-foreground)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {type === "markResolved" ? "resolved" : type}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
