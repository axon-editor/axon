import * as monaco from "monaco-editor";
import {
  type DiagnosticSeverity,
  type EditorDiagnostic,
} from "../../../../shared/diagnostics";

export { type DiagnosticSeverity, type EditorDiagnostic };

const lspMarkerOwnerPrefix = "axon-lsp:";
const lspMarkerOwners = new Set<string>();
let latestLspDiagnosticsByFile: Record<string, EditorDiagnostic[]> = {};
let lspModelListener: monaco.IDisposable | null = null;

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

function toMonacoMarkerSeverity(
  severity: DiagnosticSeverity,
): monaco.MarkerSeverity {
  switch (severity) {
    case "error":
      return monaco.MarkerSeverity.Error;
    case "warning":
      return monaco.MarkerSeverity.Warning;
    case "info":
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

function isTypeScriptLikeLanguage(languageId: string) {
  return (
    languageId === "typescript" ||
    languageId === "javascript" ||
    languageId === "typescriptreact" ||
    languageId === "javascriptreact"
  );
}

function shouldCollectMonacoMarker(marker: monaco.editor.IMarker) {
  if (marker.resource.scheme !== "file") return false;
  const markerOwner =
    typeof (marker as { owner?: unknown }).owner === "string"
      ? (marker as { owner: string }).owner
      : "";
  if (markerOwner.startsWith(lspMarkerOwnerPrefix)) {
    return false;
  }

  if (marker.source === "typescript" || marker.source === "javascript") {
    return false;
  }

  const model = monaco.editor.getModel(marker.resource);
  if (!model || model.isDisposed()) return true;

  // TypeScript and JavaScript diagnostics are project-sensitive: path aliases,
  // generated declarations, framework plugins, project references, and package
  // manager layouts all change what counts as a real error. Monaco's
  // standalone TS worker cannot see Axon's full project/LSP graph, so any
  // marker it creates here is more likely to be a false Problems entry than a
  // useful source of truth. LSP diagnostics still flow through
  // lspDiagnosticsByFile in App.tsx, so skipping these Monaco markers removes
  // the duplicate/false worker errors without hiding real project-aware LSP
  // errors.
  return !isTypeScriptLikeLanguage(model.getLanguageId());
}

function markerOwnerForPath(path: string) {
  return `${lspMarkerOwnerPrefix}${path}`;
}

function normalizeMarkerRange(
  model: monaco.editor.ITextModel,
  diagnostic: EditorDiagnostic,
) {
  const startLineNumber = Math.max(
    1,
    Math.min(diagnostic.line, model.getLineCount()),
  );
  const lineMaxColumn = model.getLineMaxColumn(startLineNumber);
  const startColumn = Math.max(1, Math.min(diagnostic.column, lineMaxColumn));
  const requestedEndLine = diagnostic.endLine ?? diagnostic.line;
  const endLineNumber = Math.max(
    startLineNumber,
    Math.min(requestedEndLine, model.getLineCount()),
  );
  const endLineMaxColumn = model.getLineMaxColumn(endLineNumber);
  const requestedEndColumn =
    diagnostic.endColumn ??
    (endLineNumber === startLineNumber ? startColumn + 1 : endLineMaxColumn);
  const endColumn = Math.max(
    endLineNumber === startLineNumber ? startColumn + 1 : 1,
    Math.min(requestedEndColumn, endLineMaxColumn),
  );

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
  };
}

function applyLanguageServerMarkersToModel(
  model: monaco.editor.ITextModel,
  diagnostics: EditorDiagnostic[],
) {
  const path = model.uri.fsPath;
  const owner = markerOwnerForPath(path);
  lspMarkerOwners.add(owner);

  monaco.editor.setModelMarkers(
    model,
    owner,
    diagnostics.map((diagnostic) => ({
      ...normalizeMarkerRange(model, diagnostic),
      message: diagnostic.message,
      severity: toMonacoMarkerSeverity(diagnostic.severity),
      source: diagnostic.source ?? "lsp",
      code:
        typeof diagnostic.code === "string" ||
        typeof diagnostic.code === "number"
          ? String(diagnostic.code)
          : undefined,
    })),
  );
}

function ensureLanguageServerModelListener() {
  if (lspModelListener) return;

  lspModelListener = monaco.editor.onDidCreateModel((model) => {
    if (model.uri.scheme !== "file") return;
    const diagnostics = latestLspDiagnosticsByFile[model.uri.fsPath];
    if (!diagnostics) return;

    // Diagnostics often arrive before a file is opened. VS Code and Zed still
    // paint the squiggle as soon as that file becomes visible because the
    // diagnostics store outlives the editor widget. I mirror that behavior by
    // replaying the latest LSP diagnostics when Monaco creates the file model.
    applyLanguageServerMarkersToModel(model, diagnostics);
  });
}

export function collectEditorDiagnostics(): EditorDiagnostic[] {
  return monaco.editor
    .getModelMarkers({})
    .filter(shouldCollectMonacoMarker)
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
        endLine: marker.endLineNumber,
        endColumn: marker.endColumn,
        code:
          typeof marker.code === "string" || typeof marker.code === "number"
            ? marker.code
            : undefined,
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

export function syncLanguageServerDiagnosticsToMonaco(
  diagnosticsByFile: Record<string, EditorDiagnostic[]>,
) {
  latestLspDiagnosticsByFile = diagnosticsByFile;
  ensureLanguageServerModelListener();

  const nextOwners = new Set<string>();

  Object.entries(diagnosticsByFile).forEach(([path, diagnostics]) => {
    const uri = monaco.Uri.file(path);
    const model = monaco.editor.getModel(uri);
    const owner = markerOwnerForPath(path);
    nextOwners.add(owner);

    if (!model || model.isDisposed()) {
      // LSP can publish diagnostics before the file is open in Monaco. I keep
      // those diagnostics in React state for the Problems panel, then wait
      // until the model exists before painting editor squiggles. Calling
      // setModelMarkers without a model would only drop the information and
      // make unopened-file diagnostics disappear from the UI.
      return;
    }

    applyLanguageServerMarkersToModel(model, diagnostics);
  });

  lspMarkerOwners.forEach((owner) => {
    if (nextOwners.has(owner)) return;
    const path = owner.slice(lspMarkerOwnerPrefix.length);
    const model = monaco.editor.getModel(monaco.Uri.file(path));
    if (model && !model.isDisposed()) {
      monaco.editor.setModelMarkers(model, owner, []);
    }
  });

  lspMarkerOwners.clear();
  nextOwners.forEach((owner) => lspMarkerOwners.add(owner));
}

export function clearLanguageServerDiagnosticsFromMonaco() {
  latestLspDiagnosticsByFile = {};
  lspMarkerOwners.forEach((owner) => {
    const path = owner.slice(lspMarkerOwnerPrefix.length);
    const model = monaco.editor.getModel(monaco.Uri.file(path));
    if (model && !model.isDisposed()) {
      monaco.editor.setModelMarkers(model, owner, []);
    }
  });
  lspMarkerOwners.clear();
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
