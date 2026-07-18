import * as monaco from "monaco-editor";
import { applyWorkspaceEdits } from "./workspaceEdits";
import { detectLanguageServerLanguage } from "../../../renderer/features/editor/lib/monacoModels";

const configuredMonacos = new WeakSet<typeof monaco>();

const lspNavigationLanguages = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "php",
  "lua",
  "cpp",
  "c",
  "dockerfile",
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "shell",
  "proto",
  "xml",
];

const monacoNativeHoverLanguages = new Set(["typescript", "javascript"]);

function isFileInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedFolder = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

function toLspRequestBase(model: monaco.editor.ITextModel) {
  const folderPath = window.axonCompletionWorkspacePath;
  const filePath = model.uri.fsPath;
  if (!folderPath || !isFileInsideWorkspace(filePath, folderPath)) return null;

  return {
    folderPath,
    filePath,
    languageId: detectLanguageServerLanguage(filePath),
    content: model.getValue(),
  };
}

function toMonacoRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}) {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

function toMonacoLocation(location: {
  filePath: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}) {
  return {
    uri: monaco.Uri.file(location.filePath),
    range: toMonacoRange(location.range),
  };
}

function registerHoverProvider(monacoInstance: typeof monaco, languageId: string) {
  if (monacoNativeHoverLanguages.has(languageId)) return;

  monacoInstance.languages.registerHoverProvider(languageId, {
    provideHover: async (model, position, token) => {
      const base = toLspRequestBase(model);
      if (!base) return null;

      const result = await window.axon.getLanguageServerHover({
        ...base,
        line: position.lineNumber,
        column: position.column,
      });
      if (token.isCancellationRequested || !result.ok || result.contents.length === 0) {
        return null;
      }

      // Monaco renders markdown hover contents with the same keyboard and
      // mouse behavior users know from VS Code. Axon only converts the LSP
      // payload into Monaco's shape here, so server-specific formatting stays
      // intact instead of being flattened into plain tooltip text.
      return {
        contents: result.contents.map((value) => ({ value })),
        range: result.range ? toMonacoRange(result.range) : undefined,
      };
    },
  });
}

function registerDefinitionProvider(
  monacoInstance: typeof monaco,
  languageId: string,
) {
  monacoInstance.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (model, position, token) => {
      const base = toLspRequestBase(model);
      if (!base) return [];

      const result = await window.axon.getLanguageServerDefinitions({
        ...base,
        line: position.lineNumber,
        column: position.column,
      });
      if (token.isCancellationRequested || !result.ok) return [];

      // A definition provider must be pure from Monaco's point of view. Monaco
      // calls this while it is only checking whether a word should become a
      // Ctrl/Cmd-clickable link, so navigating as a side effect makes the editor
      // jump when the user merely holds the modifier over a symbol. Returning
      // real locations lets Monaco decide the correct UX: modifier hover shows
      // the link affordance, modifier-click performs the jump, and the editor
      // opener below still routes cross-file opens through Axon's tab model.
      return result.locations.map(toMonacoLocation);
    },
  });
}

function registerReferenceProvider(
  monacoInstance: typeof monaco,
  languageId: string,
) {
  monacoInstance.languages.registerReferenceProvider(languageId, {
    provideReferences: async (model, position, _context, token) => {
      const base = toLspRequestBase(model);
      if (!base) return [];

      const result = await window.axon.getLanguageServerReferences({
        ...base,
        line: position.lineNumber,
        column: position.column,
        includeDeclaration: true,
      });
      if (token.isCancellationRequested || !result.ok) return [];

      return result.locations.map(toMonacoLocation);
    },
  });
}

function registerRenameProvider(monacoInstance: typeof monaco, languageId: string) {
  monacoInstance.languages.registerRenameProvider(languageId, {
    provideRenameEdits: async (model, position, newName, token) => {
      const base = toLspRequestBase(model);
      if (!base) {
        return {
          edits: [],
          rejectReason: "No running language server for this file.",
        };
      }

      const result = await window.axon.renameLanguageServerSymbol({
        ...base,
        line: position.lineNumber,
        column: position.column,
        newName,
      });
      if (token.isCancellationRequested) return { edits: [] };
      if (!result.ok) {
        return {
          edits: [],
          rejectReason: result.message ?? "Rename failed.",
        };
      }

      const edits = Object.entries(result.edits).flatMap(([filePath, fileEdits]) =>
        fileEdits.map((edit) => ({
          resource: monaco.Uri.file(filePath),
          versionId: undefined,
          textEdit: {
            range: toMonacoRange(edit.range),
            text: edit.newText,
            forceMoveMarkers: true,
          },
        })),
      );

      return { edits };
    },
  });
}

function registerFormatProvider(monacoInstance: typeof monaco, languageId: string) {
  monacoInstance.languages.registerDocumentFormattingEditProvider(languageId, {
    provideDocumentFormattingEdits: async (model, options, token) => {
      const base = toLspRequestBase(model);
      if (!base) return [];

      const result = await window.axon.formatLanguageServerDocument({
        ...base,
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      });
      if (token.isCancellationRequested || !result.ok) return [];

      return result.edits.map((edit) => ({
        range: toMonacoRange(edit.range),
        text: edit.newText,
      }));
    },
  });
}

function registerSignatureHelpProvider(
  monacoInstance: typeof monaco,
  languageId: string,
) {
  monacoInstance.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [",", ")"],
    provideSignatureHelp: async (model, position, token, context) => {
      const base = toLspRequestBase(model);
      if (!base) {
        return {
          value: { signatures: [], activeSignature: 0, activeParameter: 0 },
          dispose: () => undefined,
        };
      }

      const result = await window.axon.getLanguageServerSignatureHelp({
        ...base,
        line: position.lineNumber,
        column: position.column,
        triggerCharacter: context.triggerCharacter,
      });
      if (token.isCancellationRequested || !result.ok) {
        return {
          value: { signatures: [], activeSignature: 0, activeParameter: 0 },
          dispose: () => undefined,
        };
      }

      return {
        value: {
          signatures: result.signatures.map((signature) => ({
            label: signature.label,
            documentation: signature.documentation,
            parameters: signature.parameters.map((parameter) => ({
              label: parameter.label,
              documentation: parameter.documentation,
            })),
          })),
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
        },
        dispose: () => undefined,
      };
    },
  });
}

function registerCodeActionProvider(
  monacoInstance: typeof monaco,
  languageId: string,
) {
  monacoInstance.languages.registerCodeActionProvider(languageId, {
    provideCodeActions: async (model, range, _context, token) => {
      const base = toLspRequestBase(model);
      if (!base) return { actions: [], dispose: () => undefined };

      const diagnostics = monacoInstance.editor
        .getModelMarkers({ resource: model.uri })
        .filter((marker) => {
          const markerRange = new monaco.Range(
            marker.startLineNumber,
            marker.startColumn,
            marker.endLineNumber,
            marker.endColumn,
          );
          return markerRange.intersectRanges(range) !== null;
        })
        .map((marker) => ({
          range: {
            start: {
              line: marker.startLineNumber - 1,
              character: marker.startColumn - 1,
            },
            end: {
              line: marker.endLineNumber - 1,
              character: marker.endColumn - 1,
            },
          },
          severity:
            marker.severity === monacoInstance.MarkerSeverity.Error
              ? 1
              : marker.severity === monacoInstance.MarkerSeverity.Warning
                ? 2
                : marker.severity === monacoInstance.MarkerSeverity.Info
                  ? 3
                  : 4,
          code:
            typeof marker.code === "string" ||
            typeof marker.code === "number"
              ? marker.code
              : undefined,
          source: marker.source ?? undefined,
          message: marker.message,
        }));

      const result = await window.axon.getLanguageServerCodeActions({
        ...base,
        range: {
          start: {
            line: range.startLineNumber - 1,
            character: range.startColumn - 1,
          },
          end: {
            line: range.endLineNumber - 1,
            character: range.endColumn - 1,
          },
        },
        diagnostics,
      });
      if (token.isCancellationRequested || !result.ok) {
        return { actions: [], dispose: () => undefined };
      }

      const actions = result.actions.map((action) => ({
        title: action.title,
        kind:
          action.kind === "quickfix"
            ? "quickfix"
            : action.kind?.startsWith("source")
              ? "source"
              : "refactor",
        edit: {
          edits: Object.entries(action.edits).flatMap(([filePath, edits]) =>
            edits.map((edit) => ({
              resource: monaco.Uri.file(filePath),
              versionId: undefined,
              textEdit: {
                range: toMonacoRange(edit.range),
                text: edit.newText,
                forceMoveMarkers: true,
              },
            })),
          ),
        },
        command: action.command
          ? {
              id: "axon.lsp.executeCommand",
              title: action.command.title ?? action.title,
              arguments: [
                {
                  folderPath: base.folderPath,
                  languageId,
                  command: action.command.command,
                  arguments: action.command.arguments,
                },
              ],
            }
          : undefined,
      }));

      return {
        actions,
        dispose: () => undefined,
      };
    },
  });
}

export function configureLspNavigation(
  monacoInstance: typeof monaco = monaco,
) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  // Navigation uses Monaco's native provider registry instead of a custom
  // popover. That gives Axon the familiar editor behavior immediately: hover
  // cards, Cmd-click definition jumps, reference search, rename, and format all
  // flow through the same UI shell while the actual intelligence comes from the
  // external project language server.
  for (const languageId of lspNavigationLanguages) {
    registerHoverProvider(monacoInstance, languageId);
    registerDefinitionProvider(monacoInstance, languageId);
    registerReferenceProvider(monacoInstance, languageId);
    registerRenameProvider(monacoInstance, languageId);
    registerFormatProvider(monacoInstance, languageId);
    registerSignatureHelpProvider(monacoInstance, languageId);
    registerCodeActionProvider(monacoInstance, languageId);
  }

  monacoInstance.editor.registerCommand(
    "axon.lsp.executeCommand",
    async (_accessor, request) => {
      if (!request || typeof request !== "object") return;
      const result = await window.axon.executeLanguageServerCommand(
        request as Parameters<typeof window.axon.executeLanguageServerCommand>[0],
      );
      if (!result.ok) return;
      const folderPath = window.axonCompletionWorkspacePath;
      if (!folderPath) return;
      await applyWorkspaceEdits(result.edits, folderPath, monacoInstance);
    },
  );
}
