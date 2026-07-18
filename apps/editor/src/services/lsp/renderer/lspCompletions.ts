import * as monaco from "monaco-editor";
import { detectLanguageServerLanguage } from "../../../renderer/features/editor/lib/monacoModels";
import type { LanguageServerCompletionItem } from "../../../shared/lsp";

const configuredMonacos = new WeakSet<typeof monaco>();

const lspCompletionLanguages = [
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

const webTagLanguages = [
  "html",
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];
const identifierTriggerCharacters = [
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
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "_",
  "$",
];
const packageExportCompletionLanguages = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
]);
const tailwindUtilityLanguages = [
  "html",
  "css",
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];
const localSymbolLanguages = [
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
  "html",
  "css",
  "json",
  "yaml",
  "shell",
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

const htmlDocumentSnippet = {
  label: "!",
  insertText:
    "<!doctype html>\n<html lang=\"${1:en}\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>${2:Document}</title>\n</head>\n<body>\n  $0\n</body>\n</html>",
  detail: "HTML document template",
};

const emmetVoidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

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

const pythonBuiltinSuggestions = [
  "print",
  "len",
  "range",
  "enumerate",
  "zip",
  "map",
  "filter",
  "list",
  "dict",
  "set",
  "tuple",
  "str",
  "int",
  "float",
  "bool",
  "type",
  "isinstance",
  "super",
  "open",
  "sorted",
  "sum",
  "min",
  "max",
  "any",
  "all",
  "class",
  "def",
  "return",
  "import",
  "from",
  "async",
  "await",
];

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
];

const tailwindVariantPrefixes = [
  "hover",
  "focus",
  "active",
  "disabled",
  "group-hover",
  "dark",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
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

function getTailwindTokenContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) {
  const linePrefix = getLinePrefix(model, position);
  const tokenMatch = /(?:^|\s)([^\s"'`{}<>]*)$/.exec(linePrefix);
  const token = tokenMatch?.[1] ?? "";
  const tokenStartColumn = position.column - token.length;
  const variantSeparator = token.lastIndexOf(":");
  const variantPrefix =
    variantSeparator >= 0 ? token.slice(0, variantSeparator + 1) : "";
  const utilityQuery =
    variantSeparator >= 0 ? token.slice(variantSeparator + 1) : token;

  // Monaco's normal word range intentionally breaks at `:`, which is correct
  // for TypeScript identifiers but wrong for Tailwind variants. A class token
  // such as `hover:bg-` must be replaced as one unit; otherwise accepting a
  // completion leaves duplicated text or drops the variant prefix.
  return {
    token,
    variantPrefix,
    utilityQuery: utilityQuery.toLowerCase(),
    range: new monaco.Range(
      position.lineNumber,
      Math.max(1, tokenStartColumn),
      position.lineNumber,
      position.column,
    ),
  };
}

function snippetsEnabled() {
  return window.axonEditorSettings?.editor.snippetsEnabled !== false;
}

function emmetEnabled() {
  return window.axonEditorSettings?.editor.emmetEnabled !== false;
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

  if (linePrefix.trim() === "!") return true;

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
      triggerCharacters: ["!", "<", "d", "s", "m", "b", "i", "f"],
      provideCompletionItems: (model, position) => {
        if (!snippetsEnabled()) return { suggestions: [] };
        if (!isTagSnippetCompletionContext(model, position)) {
          return { suggestions: [] };
        }

        const linePrefix = getLinePrefix(model, position);
        const word = model.getWordUntilPosition(position).word.toLowerCase();
        const isHtmlDocumentSnippetContext =
          languageId === "html" &&
          linePrefix.trim() === "!" &&
          model.getValueInRange(
            new monacoInstance.Range(1, 1, position.lineNumber, position.column),
          ).trim() === "!";
        const range = isHtmlDocumentSnippetContext
          ? new monacoInstance.Range(
              position.lineNumber,
              Math.max(1, position.column - 1),
              position.lineNumber,
              position.column,
            )
          : getWordReplaceRange(model, position);
        const suggestions = [
          ...(isHtmlDocumentSnippetContext
            ? [
                {
                  label: htmlDocumentSnippet.label,
                  kind: monacoInstance.languages.CompletionItemKind.Snippet,
                  insertText: htmlDocumentSnippet.insertText,
                  insertTextRules:
                    monacoInstance.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet,
                  detail: htmlDocumentSnippet.detail,
                  documentation:
                    "Creates a complete HTML document skeleton for a new HTML file.",
                  range,
                  sortText: "0000",
                },
              ]
            : []),
          ...webTagSnippets
            .filter(
              (snippet) =>
                !isHtmlDocumentSnippetContext &&
                (!word || snippet.label.startsWith(word)),
            )
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
            })),
        ];

        return {
          suggestions,
        };
      },
    });
  }
}

function parseEmmetAbbreviation(rawWord: string) {
  const match = /^(?<tag>[A-Za-z][\w-]*)?(?<modifiers>(?:[.#][A-Za-z_][\w-]*)+)$/.exec(rawWord);
  if (!match?.groups) return null;

  const tag = match.groups.tag || "div";
  const classes: string[] = [];
  let id = "";
  const modifierPattern = /([.#])([A-Za-z_][\w-]*)/g;
  let modifierMatch: RegExpExecArray | null;
  while ((modifierMatch = modifierPattern.exec(match.groups.modifiers))) {
    if (modifierMatch[1] === "#") {
      id = modifierMatch[2];
    } else {
      classes.push(modifierMatch[2]);
    }
  }

  return { tag, id, classes };
}

function buildEmmetSnippet(
  abbreviation: ReturnType<typeof parseEmmetAbbreviation>,
  filePath: string,
) {
  if (!abbreviation) return "";
  const isReactFile = /\.(jsx|tsx)$/i.test(filePath);
  const classAttribute = isReactFile ? "className" : "class";
  const attributes = [
    abbreviation.id ? `id="${abbreviation.id}"` : "",
    abbreviation.classes.length > 0
      ? `${classAttribute}="${abbreviation.classes.join(" ")}"`
      : "",
  ].filter(Boolean);
  const attributeText = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  if (emmetVoidTags.has(abbreviation.tag.toLowerCase())) {
    return `<${abbreviation.tag}${attributeText} />`;
  }

  return `<${abbreviation.tag}${attributeText}>$0</${abbreviation.tag}>`;
}

function registerEmmetAbbreviationProvider(monacoInstance: typeof monaco) {
  for (const languageId of webTagLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [".", "#"],
      provideCompletionItems: (model, position) => {
        if (!emmetEnabled()) return { suggestions: [] };
        if (!isTagSnippetCompletionContext(model, position)) {
          return { suggestions: [] };
        }

        const linePrefix = getLinePrefix(model, position);
        const match = /([A-Za-z][\w-]*)?(?:[.#][A-Za-z_][\w-]*)+$/.exec(linePrefix);
        if (!match) return { suggestions: [] };

        const abbreviation = parseEmmetAbbreviation(match[0]);
        const insertText = buildEmmetSnippet(
          abbreviation,
          model.uri.fsPath,
        );
        if (!abbreviation || !insertText) return { suggestions: [] };

        return {
          suggestions: [
            {
              label: match[0],
              kind: monacoInstance.languages.CompletionItemKind.Snippet,
              insertText,
              insertTextRules:
                monacoInstance.languages.CompletionItemInsertTextRule
                  .InsertAsSnippet,
              detail: "Emmet abbreviation",
              documentation:
                "Expands a compact HTML or JSX abbreviation into a real element.",
              range: new monaco.Range(
                position.lineNumber,
                position.column - match[0].length,
                position.lineNumber,
                position.column,
              ),
              sortText: "0000",
            },
          ],
        };
      },
    });
  }
}

function registerDockerfileSnippets(monacoInstance: typeof monaco) {
  monacoInstance.languages.registerCompletionItemProvider("dockerfile", {
    triggerCharacters: ["F", "W", "C", "R", "E", "A"],
    provideCompletionItems: (model, position) => {
      if (!snippetsEnabled()) return { suggestions: [] };
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

function registerPythonBuiltins(monacoInstance: typeof monaco) {
  monacoInstance.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["p", "l", "r", "i", "f", "d", "c"],
    provideCompletionItems: (model, position) => {
      const range = getWordReplaceRange(model, position);
      const word = model.getWordUntilPosition(position).word.toLowerCase();

      // Pyright provides the real project-aware list once the server is warm.
      // This small built-in layer keeps Python usable immediately after opening
      // a file, so core names like `print` and `range` do not disappear while
      // the external server is still indexing the workspace.
      return {
        suggestions: pythonBuiltinSuggestions
          .filter((label) => !word || label.startsWith(word))
          .map((label, index) => ({
            label,
            kind:
              label === "class" ||
              label === "def" ||
              label === "return" ||
              label === "import" ||
              label === "from" ||
              label === "async" ||
              label === "await"
                ? monacoInstance.languages.CompletionItemKind.Keyword
                : monacoInstance.languages.CompletionItemKind.Function,
            insertText: label,
            detail: "Python built-in",
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
        const tokenContext = getTailwindTokenContext(model, position);
        const linePrefix = getLinePrefix(model, position);
        const inClassLikeContext = isClassLikeCompletionContext(linePrefix);
        if (!inClassLikeContext && tokenContext.token.length < 2) {
          return { suggestions: [] };
        }

        const variantSuggestions =
          tokenContext.variantPrefix.length === 0
            ? tailwindVariantPrefixes
                .filter((variant) =>
                  variant.startsWith(tokenContext.utilityQuery),
                )
                .map((variant, index) => ({
                  label: `${variant}:`,
                  kind: monacoInstance.languages.CompletionItemKind.Keyword,
                  insertText: `${variant}:`,
                  detail: "Tailwind variant",
                  documentation:
                    "Tailwind variant prefix. Continue typing a utility after the colon.",
                  sortText: `0${String(index).padStart(3, "0")}`,
                  range: tokenContext.range,
                }))
            : [];

        const utilitySuggestions = tailwindUtilitySuggestions
          .filter(
            (utility) =>
              !tokenContext.utilityQuery ||
              utility.startsWith(tokenContext.utilityQuery),
          )
          .slice(0, 40)
          .map((utility, index) => {
            const insertText = `${tokenContext.variantPrefix}${utility}`;
            return {
              label: insertText,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText,
              detail: tokenContext.variantPrefix
                ? "Tailwind variant utility"
                : "Tailwind utility",
              documentation:
                "Local Tailwind utility hint. The Tailwind language server can add project-aware completions when it is installed.",
              sortText: `1${String(index).padStart(3, "0")}`,
              range: tokenContext.range,
            };
          });

        return {
          suggestions: [...variantSuggestions, ...utilitySuggestions],
        };
      },
    });
  }
}

interface LspBackedCompletionItem extends monaco.languages.CompletionItem {
  axonLspItem?: LanguageServerCompletionItem;
  axonFolderPath?: string;
  axonLanguageId?: string;
}

function applyResolvedLspFields(
  completion: LspBackedCompletionItem,
  item: LanguageServerCompletionItem,
) {
  const textEditRange = toMonacoRange(item.textEdit?.range);
  completion.detail = item.detail;
  completion.documentation = item.documentation;
  completion.insertText = item.textEdit?.newText ?? item.insertText ?? item.label;
  completion.additionalTextEdits = item.additionalTextEdits?.map((edit) => ({
    range: toMonacoRange(edit.range)!,
    text: edit.newText,
    forceMoveMarkers: true,
  }));
  if (textEditRange) completion.range = textEditRange;
  return completion;
}

function registerExternalLspProvider(monacoInstance: typeof monaco) {
  for (const languageId of lspCompletionLanguages) {
    monacoInstance.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [
        ".",
        ":",
        "/",
        "\"",
        "'",
        "<",
        "@",
        "#",
        "(",
        ...(packageExportCompletionLanguages.has(languageId)
          ? identifierTriggerCharacters
          : []),
      ],
      resolveCompletionItem: async (completion, token) => {
        const item = completion as LspBackedCompletionItem;
        if (
          token.isCancellationRequested ||
          !item.axonLspItem?.data ||
          !item.axonFolderPath ||
          !item.axonLanguageId
        ) {
          return completion;
        }

        const result = await window.axon.resolveLanguageServerCompletion({
          folderPath: item.axonFolderPath,
          languageId: item.axonLanguageId,
          item: item.axonLspItem,
        });
        if (token.isCancellationRequested || !result.ok || !result.items[0]) {
          return completion;
        }
        return applyResolvedLspFields(item, result.items[0]);
      },
      provideCompletionItems: async (model, position, context, token) => {
        const folderPath = window.axonCompletionWorkspacePath;
        const filePath = model.uri.fsPath;
        if (!folderPath || !isFileInsideWorkspace(filePath, folderPath)) {
          return { suggestions: [] };
        }

        // TypeScript only exposes package export completions such as Lucide
        // icons, React components, and exported helper functions after the
        // language server sees an identifier-shaped request. Monaco's default
        // trigger characters are punctuation-focused, so a user typing
        // `Camera` in TSX could get only local symbols until they manually
        // opened completion. Letting TS/JS request completions on identifier
        // characters keeps the behavior close to production IDEs while the
        // workspace/path guard above prevents unrelated files from spamming the
        // main process.
        const result = await window.axon.getLanguageServerCompletions({
          folderPath,
          filePath,
          languageId: detectLanguageServerLanguage(filePath),
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
          triggerCharacter:
            context.triggerKind ===
              monacoInstance.languages.CompletionTriggerKind.TriggerCharacter
              ? context.triggerCharacter
              : undefined,
        });
        if (token.isCancellationRequested || !result.ok) {
          return { suggestions: [] };
        }

        const range = getWordReplaceRange(model, position);
        return {
          suggestions: result.items.map((item): LspBackedCompletionItem => {
            const textEditRange = toMonacoRange(item.textEdit?.range);
            const insertText =
              item.textEdit?.newText ?? item.insertText ?? item.label;

            // Monaco already owns the same suggest-widget interaction model
            // users know from VS Code: keyboard navigation, mouse selection,
            // filtering by the typed prefix, commit characters, and snippet
            // tab stops. The important part here is preserving the LSP fields
            // instead of flattening everything into plain text suggestions.
            //
            // I intentionally do not hide LSP snippet insertText values behind
            // the user's local-snippets setting. Language servers use snippet
            // formatting for real semantic completions too, including React
            // components, functions, and package exports that also carry
            // additionalTextEdits for auto-imports. Filtering those items here
            // makes installed libraries like lucide-react look invisible even
            // though TypeScript returned the correct completion.
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
              axonLspItem: item,
              axonFolderPath: folderPath,
              axonLanguageId: detectLanguageServerLanguage(filePath),
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
  registerEmmetAbbreviationProvider(monacoInstance);
  registerDockerfileSnippets(monacoInstance);
  registerPythonBuiltins(monacoInstance);
  registerTailwindUtilityProvider(monacoInstance);
  registerExternalLspProvider(monacoInstance);
}
