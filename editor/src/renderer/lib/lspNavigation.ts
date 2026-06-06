import * as monaco from "monaco-editor";

const configuredMonacos = new WeakSet<typeof monaco>();

const lspNavigationLanguages = [
  "typescript",
  "javascript",
  "go",
  "rust",
  "python",
  "cpp",
  "c",
];

function isFileInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedFolder = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

function toLspRequestBase(
  model: monaco.editor.ITextModel,
  languageId: string,
) {
  const folderPath = window.axonCompletionWorkspacePath;
  const filePath = model.uri.fsPath;
  if (!folderPath || !isFileInsideWorkspace(filePath, folderPath)) return null;

  return {
    folderPath,
    filePath,
    languageId,
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
  monacoInstance.languages.registerHoverProvider(languageId, {
    provideHover: async (model, position, token) => {
      const base = toLspRequestBase(model, languageId);
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
      const base = toLspRequestBase(model, languageId);
      if (!base) return [];

      const result = await window.axon.getLanguageServerDefinitions({
        ...base,
        line: position.lineNumber,
        column: position.column,
      });
      if (token.isCancellationRequested || !result.ok) return [];

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
      const base = toLspRequestBase(model, languageId);
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
      const base = toLspRequestBase(model, languageId);
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
          edit: {
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
      const base = toLspRequestBase(model, languageId);
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
  }
}
