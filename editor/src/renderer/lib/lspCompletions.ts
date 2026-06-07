import * as monaco from "monaco-editor";

const configuredMonacos = new WeakSet<typeof monaco>();

const lspCompletionLanguages = [
  "typescript",
  "javascript",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "ruby",
  "php",
  "lua",
  "cpp",
  "dockerfile",
  "html",
  "css",
];

const webTagLanguages = [
  "html",
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
];
const tailwindUtilityLanguages = [
  "html",
  "css",
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
];
const localSymbolLanguages = [
  "typescript",
  "javascript",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "ruby",
  "php",
  "lua",
  "cpp",
  "html",
  "css",
  "javascriptreact",
  "typescriptreact",
  "json",
  "dockerfile",
];

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

const dockerfileSnippets = [
  ["FROM", "FROM ${1:node:22-alpine}"],
  ["WORKDIR", "WORKDIR ${1:/app}"],
  ["COPY", "COPY ${1:.} ${2:.}"],
  ["RUN", "RUN ${1:npm install}"],
  ["CMD", "CMD [\"${1:npm}\", \"${2:start}\"]"],
  ["EXPOSE", "EXPOSE ${1:3000}"],
  ["ENV", "ENV ${1:NODE_ENV}=${2:production}"],
  ["ARG", "ARG ${1:VERSION}"],
].map(([label, insertText]) => ({
  label,
  insertText,
  detail: "Dockerfile instruction",
}));

const tailwindUtilitySuggestions = [
  "flex",
  "grid",
  "hidden",
  "block",
  "inline-flex",
  "items-center",
  "items-start",
  "justify-center",
  "justify-between",
  "gap-1",
  "gap-2",
  "gap-3",
  "p-2",
  "px-3",
  "py-2",
  "m-0",
  "mx-auto",
  "w-full",
  "h-full",
  "min-h-0",
  "rounded",
  "rounded-md",
  "rounded-lg",
  "border",
  "border-transparent",
  "bg-transparent",
  "bg-black",
  "bg-white",
  "text-white",
  "text-black",
  "text-sm",
  "text-xs",
  "font-medium",
  "font-semibold",
  "truncate",
  "overflow-hidden",
  "overflow-y-auto",
  "transition-colors",
  "cursor-pointer",
  "hover:bg-[#11151c]",
  "hover:text-white",
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

function toMonacoRange(
  range:
    | {
        start: { line: number; character: number };
        end: { line: number; character: number };
      }
    | undefined,
) {
  if (!range) return undefined;

  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
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

function getLinePrefix(model: monaco.editor.ITextModel, position: monaco.Position) {
  return model.getLineContent(position.lineNumber).slice(0, position.column - 1);
}

function isClassLikeCompletionContext(linePrefix: string) {
  return /\b(class|className)\s*=\s*["'`][^"'`]*$/i.test(linePrefix) ||
    /@apply\s+[^;{}]*$/i.test(linePrefix);
}

function isStyleAttributeCompletionContext(linePrefix: string) {
  return /\bstyle\s*=\s*(["'`][^"'`]*$|\{\{?[^}]*$)/i.test(linePrefix);
}

function isTagSnippetCompletionContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) {
  const linePrefix = getLinePrefix(model, position);
  if (
    isClassLikeCompletionContext(linePrefix) ||
    isStyleAttributeCompletionContext(linePrefix)
  ) {
    return false;
  }

  // HTML/JSX element snippets should feel eager after `<`, but they should not
  // pollute normal string and attribute completions. This check allows
  // `<d`, `return d`, and a line-leading `d` while blocking `className="d"` and
  // `style={{ d }}` where Tailwind/CSS suggestions are the expected behavior.
  return /(^|[<>{}();,\s])[\w-]*$/u.test(linePrefix);
}

function collectLocalSymbolSuggestions(
  monacoInstance: typeof monaco,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) {
  const word = model.getWordUntilPosition(position);
  const prefix = word.word;
  if (prefix.length < 2) return [];

  const prefixLower = prefix.toLowerCase();
  const range = getWordReplaceRange(model, position);
  const currentLine = position.lineNumber;
  const symbols = new Map<string, number>();
  const symbolPattern = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;

  // This provider is intentionally local and synchronous. LSP results are the
  // authority for types, imports, and project-wide intelligence, but they can
  // take a moment when a server is cold. Scanning the open model gives the
  // suggest widget useful prefix matches immediately, which keeps typing fast
  // while the richer LSP provider fills in behind it.
  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const line = model.getLineContent(lineNumber);
    symbolPattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = symbolPattern.exec(line))) {
      const label = match[0];
      if (label === prefix || !label.toLowerCase().startsWith(prefixLower)) {
        continue;
      }

      const existingDistance = symbols.get(label);
      const distance = Math.abs(currentLine - lineNumber);
      if (existingDistance === undefined || distance < existingDistance) {
        symbols.set(label, distance);
      }
    }
  }

  return Array.from(symbols.entries())
    .sort(([leftLabel, leftDistance], [rightLabel, rightDistance]) => {
      return (
        leftDistance - rightDistance ||
        leftLabel.length - rightLabel.length ||
        leftLabel.localeCompare(rightLabel)
      );
    })
    .slice(0, 40)
    .map(([label], index) => ({
      label,
      kind: monacoInstance.languages.CompletionItemKind.Variable,
      detail: "Local symbol",
      insertText: label,
      filterText: label,
      sortText: `0${String(index).padStart(3, "0")}`,
      range,
    }));
}

function registerLocalSymbolProvider(monacoInstance: typeof monaco) {
  for (const languageId of localSymbolLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "j",
        "k",
        "l",
        "m",
        "n",
        "o",
        "p",
        "q",
        "r",
        "s",
        "t",
        "u",
        "v",
        "w",
        "x",
        "y",
        "z",
        "_",
        "$",
      ],
      provideCompletionItems: (model, position) => ({
        suggestions: collectLocalSymbolSuggestions(
          monacoInstance,
          model,
          position,
        ),
      }),
    });
  }
}

function registerWebTagSnippets(monacoInstance: typeof monaco) {
  for (const languageId of webTagLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ["<", "d", "s", "m", "b", "i", "f"],
      provideCompletionItems: (model, position) => {
        if (!isTagSnippetCompletionContext(model, position)) {
          return { suggestions: [] };
        }

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

function registerDockerfileSnippets(monacoInstance: typeof monaco) {
  monacoInstance.languages.registerCompletionItemProvider("dockerfile", {
    triggerCharacters: ["F", "W", "C", "R", "E", "A"],
    provideCompletionItems: (model, position) => {
      const range = getWordReplaceRange(model, position);
      const word = model.getWordUntilPosition(position).word.toUpperCase();
      return {
        suggestions: dockerfileSnippets
          .filter((snippet) => !word || snippet.label.startsWith(word))
          .map((snippet, index) => ({
            label: snippet.label,
            kind: monacoInstance.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            insertTextRules:
              monacoInstance.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            detail: snippet.detail,
            sortText: `0${String(index).padStart(3, "0")}`,
            range,
          })),
      };
    },
  });
}

function registerTailwindUtilityProvider(monacoInstance: typeof monaco) {
  for (const languageId of tailwindUtilityLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ["\"", "'", "`", " ", "-", ":"],
      provideCompletionItems: (model, position) => {
        const range = getWordReplaceRange(model, position);
        const word = model.getWordUntilPosition(position).word.toLowerCase();
        const linePrefix = getLinePrefix(model, position);
        const inClassLikeContext = isClassLikeCompletionContext(linePrefix);
        if (!inClassLikeContext && word.length < 2) {
          return { suggestions: [] };
        }

        return {
          suggestions: tailwindUtilitySuggestions
            .filter((utility) => !word || utility.startsWith(word))
            .slice(0, 40)
            .map((utility, index) => ({
              label: utility,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: utility,
              detail: "Tailwind utility",
              documentation:
                "Local Tailwind utility hint. The Tailwind language server can add project-aware completions when it is installed.",
              sortText: `1${String(index).padStart(3, "0")}`,
              range,
            })),
        };
      },
    });
  }
}

function registerExternalLspProvider(monacoInstance: typeof monaco) {
  for (const languageId of lspCompletionLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [".", ":", "/", "\"", "'", "<", "@", "#", "("],
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
          suggestions: result.items.map((item) => {
            const textEditRange = toMonacoRange(item.textEdit?.range);
            const insertText = item.textEdit?.newText ?? item.insertText ?? item.label;

            // Monaco already owns the same suggest-widget interaction model
            // users know from VS Code: keyboard navigation, mouse selection,
            // filtering by the typed prefix, commit characters, and snippet
            // tab stops. The important part here is preserving the LSP fields
            // instead of flattening everything into plain text suggestions.
            return {
              label: item.label,
              kind:
                item.kind !== undefined
                  ? (lspToMonacoCompletionKind[item.kind] ??
                    monacoInstance.languages.CompletionItemKind.Text)
                  : monacoInstance.languages.CompletionItemKind.Text,
              detail: item.detail,
              documentation: item.documentation,
              insertText,
              insertTextRules:
                item.insertTextFormat === 2
                  ? monacoInstance.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet
                  : undefined,
              filterText: item.filterText,
              sortText: item.sortText,
              commitCharacters: item.commitCharacters,
              preselect: item.preselect,
              additionalTextEdits: item.additionalTextEdits?.map((edit) => ({
                range: toMonacoRange(edit.range) ?? range,
                text: edit.newText,
                forceMoveMarkers: true,
              })),
              range: textEditRange ?? range,
            };
          }),
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
  // running. Local symbols give the popup an instant first paint, and web
  // snippets keep common tags like `div` available before a server warms up.
  registerLocalSymbolProvider(monacoInstance);
  registerWebTagSnippets(monacoInstance);
  registerDockerfileSnippets(monacoInstance);
  registerTailwindUtilityProvider(monacoInstance);
  registerExternalLspProvider(monacoInstance);
}
