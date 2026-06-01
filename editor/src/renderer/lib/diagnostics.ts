import * as monaco from "monaco-editor";
import {
  type DiagnosticSeverity,
  type EditorDiagnostic,
} from "../../shared/diagnostics";

export { type DiagnosticSeverity, type EditorDiagnostic };

function toDiagnosticSeverity(
  severity: monaco.MarkerSeverity,
): DiagnosticSeverity {
  switch (severity) {
    case monaco.MarkerSeverity.Error:
      return "error";
    case monaco.MarkerSeverity.Warning:
      return "warning";
    case monaco.MarkerSeverity.Info:
      return "info";
    default:
      return "hint";
  }
}

export function collectEditorDiagnostics(): EditorDiagnostic[] {
  return monaco.editor
    .getModelMarkers({})
    .filter((marker) => marker.resource.scheme === "file")
    .map((marker) => {
      const path = marker.resource.fsPath;
      const line = marker.startLineNumber;
      const column = marker.startColumn;
      const severity = toDiagnosticSeverity(marker.severity);

      return {
        id: `${path}:${line}:${column}:${severity}:${marker.message}`,
        path,
        message: marker.message,
        line,
        column,
        severity,
        source: marker.source ?? null,
      };
    })
    .sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      if (a.line !== b.line) return a.line - b.line;
      return a.column - b.column;
    });
}

export function onEditorDiagnosticsChanged(
  callback: (diagnostics: EditorDiagnostic[]) => void,
) {
  // Monaco owns syntax diagnostics for the models currently loaded in the
  // editor. This listener gives Axon one diagnostics feed today without
  // coupling the Problems panel to a future LSP implementation. When LSP lands,
  // this module can become the merge point for Monaco markers and server
  // diagnostics while the UI keeps consuming the same EditorDiagnostic shape.
  const emitDiagnostics = () => callback(collectEditorDiagnostics());
  emitDiagnostics();

  const disposable = monaco.editor.onDidChangeMarkers(emitDiagnostics);
  return () => disposable.dispose();
}
