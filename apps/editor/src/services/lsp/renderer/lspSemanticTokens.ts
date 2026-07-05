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
];

const semanticTokenCache = new Map<
  string,
  {
    versionId: number;
    promise: Promise<monaco.languages.SemanticTokens | null>;
  }
>();

type AbsoluteSemanticToken = {
  line: number;
  character: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
  source: "lsp" | "textmate";
};

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

  // LSP tokens come from the language server's symbol table, so they win when
  // they cover the same source range as TextMate. TextMate is still essential
  // for Bug 1 from the syntax report: it provides VS Code-style grammar scopes
  // for JSX tags, attributes, object keys, and punctuation-adjacent identifiers
  // while the language server is silent or intentionally broad. Dropping only
  // overlapping TextMate tokens gives Axon both layers without producing
  // invalid overlapping semantic-token ranges for Monaco.
  const nonOverlappingTextMateTokens = textMateTokens.filter((textMateToken) => {
    return !lspTokens.some((lspToken) => tokensOverlap(lspToken, textMateToken));
  });
  const merged = encodeSemanticTokens([
    ...lspTokens,
    ...nonOverlappingTextMateTokens,
  ]);

  return merged.length > 0
    ? {
        data: Uint32Array.from(merged),
        resultId: input.resultId,
      }
    : null;
}

function createSemanticTokenPromise(model: monaco.editor.ITextModel) {
  const base = toLspRequestBase(model);
  if (!base) return Promise.resolve(null);

  const textMatePromise = createTextMateSemanticTokens({
    languageId: base.languageId,
    content: base.content,
  });

  return window.axon
    .getLanguageServerSemanticTokens(base)
    .then(async (result): Promise<monaco.languages.SemanticTokens | null> => {
      const textMateTokens = await textMatePromise;
      if (!result.ok || result.data.length === 0) return textMateTokens;

      return mergeSemanticTokenLayers({
        lsp: result.data,
        textMate: textMateTokens,
        resultId: result.resultId,
      });
    })
    .catch(() => textMatePromise);
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
      const cacheKey = getSemanticTokenCacheKey(model);
      const cached = semanticTokenCache.get(cacheKey);
      if (cached?.versionId === model.getVersionId()) {
        const cachedResult = await cached.promise;
        return token.isCancellationRequested ? null : cachedResult;
      }

      const promise = createSemanticTokenPromise(model);
      semanticTokenCache.set(cacheKey, {
        versionId: model.getVersionId(),
        promise,
      });

      const result = await promise;
      if (token.isCancellationRequested) return null;

      // The cache is keyed by model version, so older entries naturally stop
      // being used after edits. I still trim it opportunistically to avoid
      // keeping semantic token arrays for many closed files in long sessions.
      if (semanticTokenCache.size > 80) {
        const staleKeys = Array.from(semanticTokenCache.keys()).slice(0, 20);
        staleKeys.forEach((key) => semanticTokenCache.delete(key));
      }

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
