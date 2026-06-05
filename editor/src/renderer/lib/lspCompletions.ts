import * as monaco from "monaco-editor";

const configuredMonacos = new WeakSet<typeof monaco>();

const lspCompletionLanguages = [
  "typescript",
  "javascript",
  "go",
  "rust",
  "python",
  "cpp",
];

const webTagLanguages = ["html", "javascript", "typescript"];

const webTagSnippets = [
  {
    label: "div",
    insertText: "<div>$0</div>",
    detail: "HTML div element",
  },
  {
    label: "span",
    insertText: "<span>$0</span>",
    detail: "HTML span element",
  },
  {
    label: "section",
    insertText: "<section>$0</section>",
    detail: "HTML section element",
  },
  {
    label: "main",
    insertText: "<main>$0</main>",
    detail: "HTML main element",
  },
  {
    label: "button",
    insertText: "<button type=\"button\">$0</button>",
    detail: "HTML button element",
  },
  {
    label: "input",
    insertText: "<input $0/>",
    detail: "HTML input element",
  },
  {
    label: "form",
    insertText: "<form>$0</form>",
    detail: "HTML form element",
  },
];

const lspToMonacoCompletionKind: Record<
  number,
  monaco.languages.CompletionItemKind
> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  16: monaco.languages.CompletionItemKind.Color,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  19: monaco.languages.CompletionItemKind.Folder,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter,
};

function getWordReplaceRange(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) {
  const word = model.getWordUntilPosition(position);
  return new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn,
  );
}

function isFileInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedFolder = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

function registerWebTagSnippets(monacoInstance: typeof monaco) {
  for (const languageId of webTagLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ["<", "d", "s", "m", "b", "i", "f"],
      provideCompletionItems: (model, position) => {
        const range = getWordReplaceRange(model, position);
        const word = model.getWordUntilPosition(position).word.toLowerCase();
        const suggestions = webTagSnippets
          .filter((snippet) => !word || snippet.label.startsWith(word))
          .map((snippet) => ({
            label: snippet.label,
            kind: monacoInstance.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            insertTextRules:
              monacoInstance.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            detail: snippet.detail,
            documentation:
              "Axon web snippet. Works in HTML and JSX/TSX so common tags appear as soon as you type.",
            range,
          }));

        return {
          suggestions,
        };
      },
    });
  }
}

function registerExternalLspProvider(monacoInstance: typeof monaco) {
  for (const languageId of lspCompletionLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [".", ":", "/", "\"", "'", "<"],
      provideCompletionItems: async (model, position, _context, token) => {
        const folderPath = window.axonCompletionWorkspacePath;
        const filePath = model.uri.fsPath;
        if (!folderPath || !isFileInsideWorkspace(filePath, folderPath)) {
          return { suggestions: [] };
        }

        const result = await window.axon.getLanguageServerCompletions({
          folderPath,
          filePath,
          languageId,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        });
        if (token.isCancellationRequested || !result.ok) {
          return { suggestions: [] };
        }

        const range = getWordReplaceRange(model, position);
        return {
          suggestions: result.items.map((item) => ({
            label: item.label,
            kind:
              item.kind !== undefined
                ? (lspToMonacoCompletionKind[item.kind] ??
                  monacoInstance.languages.CompletionItemKind.Text)
                : monacoInstance.languages.CompletionItemKind.Text,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText ?? item.label,
            filterText: item.filterText,
            sortText: item.sortText,
            range,
          })),
        };
      },
    });
  }
}

export function configureLspCompletions(monacoInstance: typeof monaco = monaco) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  // Monaco owns fast built-in suggestions for HTML/CSS/TypeScript, while Axon's
  // external LSP bridge adds project-aware completions when a real server is
  // running. I also register a tiny web-snippet provider because users expect
  // common tags like `div` to pop up immediately in HTML and JSX/TSX, even
  // before a project language server has warmed up.
  registerWebTagSnippets(monacoInstance);
  registerExternalLspProvider(monacoInstance);
}
