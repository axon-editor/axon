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

function createSemanticTokenPromise(model: monaco.editor.ITextModel) {
  const base = toLspRequestBase(model);
  if (!base) return Promise.resolve(null);

  return window.axon
    .getLanguageServerSemanticTokens(base)
    .then(async (result): Promise<monaco.languages.SemanticTokens | null> => {
      if (!result.ok || result.data.length === 0) {
        return createTextMateSemanticTokens({
          languageId: base.languageId,
          content: base.content,
        });
      }

      // Monaco expects the same compact relative integer encoding that LSP
      // semantic tokens use: delta line, delta character, length, token type,
      // and modifier bitset. Keeping the data compact here prevents a large
      // workspace file from allocating thousands of tiny token objects every
      // time semantic highlighting refreshes.
      return {
        data: Uint32Array.from(result.data),
        resultId: result.resultId,
      };
    })
    .catch(() =>
      createTextMateSemanticTokens({
        languageId: base.languageId,
        content: base.content,
      }),
    );
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
