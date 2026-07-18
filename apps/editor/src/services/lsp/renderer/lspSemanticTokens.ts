import * as monaco from "monaco-editor";
import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
} from "../../../shared/lsp";
import { detectLanguageServerLanguage } from "../../../renderer/features/editor/lib/monacoModels";
import { createTextMateSemanticTokens } from "./textMateSemanticTokens";

const configuredMonacos = new WeakSet<typeof monaco>();

const semanticTokenLanguages = [
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
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "shell",
  "dockerfile",
  "xml",
  "proto",
];

const semanticTokenCache = new Map<
  string,
  {
    versionId: number;
    promise: Promise<monaco.languages.SemanticTokens | null>;
  }
>();
const TEXTMATE_LSP_MERGE_WAIT_MS = 650;

type AbsoluteSemanticToken = {
  line: number;
  character: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
  source: "lsp" | "textmate";
};

const grammarOwnedTokenTypes = new Set([
  "attribute",
  "comment",
  "keyword",
  "number",
  "operator",
  "regexp",
  "string",
  "tag",
  "text",
]);

const symbolOwnedTokenTypes = new Set([
  "builtinType",
  "class",
  "constructor",
  "enum",
  "enumMember",
  "function",
  "interface",
  "method",
  "namespace",
  "parameter",
  "property",
  "struct",
  "trait",
  "type",
  "typeAlias",
  "typeParameter",
]);

function isFileInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = filePath.replace(/\\/g, "/");
  const normalizedFolder = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

function getSemanticTokenCacheKey(model: monaco.editor.ITextModel) {
  return `${model.uri.toString()}::${model.getVersionId()}`;
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

function decodeSemanticTokens(
  data: Uint32Array | number[],
  source: AbsoluteSemanticToken["source"],
) {
  const tokens: AbsoluteSemanticToken[] = [];
  let line = 0;
  let character = 0;

  for (let offset = 0; offset < data.length; offset += 5) {
    const deltaLine = data[offset] ?? 0;
    const deltaCharacter = data[offset + 1] ?? 0;
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaCharacter : deltaCharacter;
    tokens.push({
      line,
      character,
      length: data[offset + 2] ?? 0,
      tokenType: data[offset + 3] ?? 0,
      tokenModifiers: data[offset + 4] ?? 0,
      source,
    });
  }

  return tokens;
}

function tokensOverlap(a: AbsoluteSemanticToken, b: AbsoluteSemanticToken) {
  if (a.line !== b.line) return false;
  const aEnd = a.character + a.length;
  const bEnd = b.character + b.length;
  return a.character < bEnd && b.character < aEnd;
}

function semanticTokenTypeName(token: AbsoluteSemanticToken) {
  return LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES[token.tokenType] ?? "variable";
}

function semanticTokenPaintPriority(token: AbsoluteSemanticToken) {
  const tokenType = semanticTokenTypeName(token);

  // TextMate grammars are stronger for lexical structure: JSX/HTML tags,
  // attributes, punctuation, strings, comments, and keywords. Language servers
  // are stronger for symbol meaning: functions, methods, classes, interfaces,
  // parameters, and properties. A source-only merge made LSP ranges erase the
  // richer grammar layer, which is why a correct theme could still look flat.
  if (grammarOwnedTokenTypes.has(tokenType)) {
    return token.source === "textmate" ? 120 : 90;
  }
  if (symbolOwnedTokenTypes.has(tokenType)) {
    return token.source === "lsp" ? 120 : 105;
  }
  if (tokenType === "variable") {
    return token.source === "lsp" ? 45 : 35;
  }
  return token.source === "lsp" ? 80 : 70;
}

function encodeSemanticTokens(tokens: AbsoluteSemanticToken[]) {
  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  tokens
    .filter((token) => token.length > 0)
    .sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.character !== b.character) return a.character - b.character;
      return a.source === "lsp" ? -1 : 1;
    })
    .forEach((token) => {
      const deltaLine = token.line - previousLine;
      const deltaCharacter =
        deltaLine === 0
          ? token.character - previousCharacter
          : token.character;
      data.push(
        deltaLine,
        deltaCharacter,
        token.length,
        token.tokenType,
        token.tokenModifiers,
      );
      previousLine = token.line;
      previousCharacter = token.character;
    });

  return data;
}

function mergeSemanticTokenLayers(input: {
  lsp?: number[];
  textMate?: monaco.languages.SemanticTokens | null;
  resultId?: string;
}) {
  const lspTokens = input.lsp ? decodeSemanticTokens(input.lsp, "lsp") : [];
  const textMateTokens = input.textMate
    ? decodeSemanticTokens(input.textMate.data, "textmate")
    : [];

  // Monaco rejects overlapping semantic-token ranges, so Axon has to collapse
  // the LSP and grammar layers before painting. The old merge gave every
  // overlap to LSP. That sounds reasonable until TypeScript reports a broad
  // identifier where the grammar had a precise JSX tag, attribute, or literal:
  // the rich token was thrown away before the theme could color it. This merge
  // compares token intent instead, preserving grammar-owned structure while
  // still letting LSP own real symbols.
  const selectedTextMateTokens = textMateTokens.filter((textMateToken) => {
    const textMatePriority = semanticTokenPaintPriority(textMateToken);
    const strongestLspOverlap = lspTokens
      .filter((lspToken) => tokensOverlap(lspToken, textMateToken))
      .reduce(
        (priority, lspToken) =>
          Math.max(priority, semanticTokenPaintPriority(lspToken)),
        -1,
      );

    return strongestLspOverlap <= textMatePriority;
  });
  const selectedLspTokens = lspTokens.filter((lspToken) => {
    return !selectedTextMateTokens.some((textMateToken) =>
      tokensOverlap(lspToken, textMateToken),
    );
  });
  const merged = encodeSemanticTokens([
    ...selectedLspTokens,
    ...selectedTextMateTokens,
  ]);

  return merged.length > 0
    ? {
        data: Uint32Array.from(merged),
        resultId: input.resultId,
      }
    : null;
}

function waitForLanguageServerOverlay<T>(promise: Promise<T>) {
  return Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), TEXTMATE_LSP_MERGE_WAIT_MS);
    }),
  ]);
}

function createSemanticTokenPromise(model: monaco.editor.ITextModel) {
  const content = model.getValue();
  const languageId = model.getLanguageId();
  const base = toLspRequestBase(model);

  const textMatePromise = createTextMateSemanticTokens({
    languageId,
    content,
  });
  if (!base) return textMatePromise;

  const languageServerPromise = window.axon.getLanguageServerSemanticTokens(base);

  return textMatePromise
    .then(async (textMateTokens) => {
      const result = textMateTokens
        ? await waitForLanguageServerOverlay(languageServerPromise)
        : await languageServerPromise;
      if (!result) return textMateTokens;
      if (!result.ok || result.data.length === 0) return textMateTokens;

      return mergeSemanticTokenLayers({
        lsp: result.data,
        textMate: textMateTokens,
        resultId: result.resultId,
      });
    })
    .catch(async () => {
      try {
        const result = await languageServerPromise;
        if (!result.ok || result.data.length === 0) return null;
        return {
          data: Uint32Array.from(result.data),
          resultId: result.resultId,
        };
      } catch {
        return null;
      }
    });
}

export function getSemanticTokensForModel(model: monaco.editor.ITextModel) {
  const cacheKey = getSemanticTokenCacheKey(model);
  const cached = semanticTokenCache.get(cacheKey);
  if (cached?.versionId === model.getVersionId()) return cached.promise;

  const promise = createSemanticTokenPromise(model);
  semanticTokenCache.set(cacheKey, {
    versionId: model.getVersionId(),
    promise,
  });
  if (semanticTokenCache.size > 80) {
    const staleKeys = Array.from(semanticTokenCache.keys()).slice(0, 20);
    staleKeys.forEach((key) => semanticTokenCache.delete(key));
  }

  return promise;
}

function registerSemanticTokensProvider(
  monacoInstance: typeof monaco,
  languageId: string,
) {
  monacoInstance.languages.registerDocumentSemanticTokensProvider(languageId, {
    getLegend: () => ({
      tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
      tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
    }),
    provideDocumentSemanticTokens: async (model, _lastResultId, token) => {
      const result = await getSemanticTokensForModel(model);
      if (token.isCancellationRequested) return null;

      return result;
    },
    releaseDocumentSemanticTokens: () => undefined,
  });
}

export function configureLspSemanticTokens(monacoInstance: typeof monaco) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  semanticTokenLanguages.forEach((languageId) => {
    registerSemanticTokensProvider(monacoInstance, languageId);
  });
}
