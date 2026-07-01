import { useEffect } from "react";
import { type EditorDiagnostic } from "./diagnostics";

interface UseAgentDiagnosticsExportInput {
  folderPath: string | null;
  diagnostics: EditorDiagnostic[];
}

export function useAgentDiagnosticsExport({
  folderPath,
  diagnostics,
}: UseAgentDiagnosticsExportInput) {
  useEffect(() => {
    if (!folderPath) return;

    // axon fix runs from the user's terminal, outside the renderer process, so
    // it needs a durable Problems snapshot. I debounce this export because LSPs
    // often publish diagnostics in small bursts while a file changes; writing
    // only after the burst keeps the terminal bridge current without turning
    // every diagnostic event into disk churn.
    const exportTimeout = window.setTimeout(() => {
      void window.axon
        .exportAgentDiagnostics({
          workspace: folderPath,
          updatedAt: new Date().toISOString(),
          diagnostics,
        })
        .catch((err) => {
          console.error("failed to export diagnostics for axon fix:", err);
        });
    }, 300);

    return () => window.clearTimeout(exportTimeout);
  }, [diagnostics, folderPath]);
}
