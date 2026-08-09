import * as monaco from "monaco-editor";
import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
} from "../../../shared/lsp";
import { detectLanguageServerLanguage } from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { createTextMateSemanticTokens } from "./textMateSemanticTokens";
import { canUseWorkspaceLanguageTools } from "./lspFileAccess";
import { mergeSemanticTokenLayers } from "./semanticTokenMerge";
import { isLargeDocumentModel } from "../../../shared/largeDocument";

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
const TEXTMATE_LSP_MERGE_WAIT_MS = 80;
const semanticTokenUpdateListeners = new Set<(modelUri: string) => void>();

function getSemanticTokenCacheKey(model: monaco.editor.ITextModel) {
  return `${model.uri.toString()}::${model.getVersionId()}`;
}

function toLspRequestBase(model: monaco.editor.ITextModel, content: string) {
  const folderPath = window.axonCompletionWorkspacePath;
  const filePath = model.uri.fsPath;
  if (!folderPath || !canUseWorkspaceLanguageTools(filePath, folderPath)) {
    return null;
  }

  return {
    folderPath,
    filePath,
    languageId: detectLanguageServerLanguage(filePath),
    content,
  };
}

const languageServerOverlayTimedOut = Symbol("language-server-overlay-timeout");

function waitForLanguageServerOverlay<T>(promise: Promise<T>) {
  return Promise.race<T | typeof languageServerOverlayTimedOut>([
    promise,
    new Promise<typeof languageServerOverlayTimedOut>((resolve) => {
      window.setTimeout(
        () => resolve(languageServerOverlayTimedOut),
        TEXTMATE_LSP_MERGE_WAIT_MS,
      );
    }),
  ]);
}

function createSemanticTokenPromise(
  model: monaco.editor.ITextModel,
  cacheKey: string,
) {
  const content = model.getValue();
  const languageId = model.getLanguageId();
  const base = toLspRequestBase(model, content);

  const textMatePromise = createTextMateSemanticTokens({
    languageId,
    content,
  });
  if (!base) return textMatePromise;

  const languageServerPromise =
    window.axon.getLanguageServerSemanticTokens(base);

  return textMatePromise
    .then(async (textMateTokens) => {
      const result = textMateTokens
        ? await waitForLanguageServerOverlay(languageServerPromise)
        : await languageServerPromise;
      if (result === languageServerOverlayTimedOut) {
        // Grammar colors are useful immediately; project-aware LSP symbols are
        // an enhancement and must not hold the first paint for a cold server.
        // When the server eventually responds, I replace this model version's
        // cache entry and notify mounted editors so they can repaint in place.
        void languageServerPromise
          .then((lateResult) => {
            if (
              !lateResult.ok ||
              lateResult.data.length === 0 ||
              model.isDisposed() ||
              getSemanticTokenCacheKey(model) !== cacheKey
            ) {
              return;
            }
            const merged = mergeSemanticTokenLayers({
              lsp: lateResult.data,
              textMate: textMateTokens,
              resultId: lateResult.resultId,
            });
            semanticTokenCache.set(cacheKey, {
              versionId: model.getVersionId(),
              promise: Promise.resolve(merged),
            });
            semanticTokenUpdateListeners.forEach((listener) =>
              listener(model.uri.toString()),
            );
          })
          .catch(() => undefined);
        return textMateTokens;
      }
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
  // Semantic coloring currently materializes a complete text snapshot and a
  // complete decoration stream. Large-file mode uses Monaco's lazy lexical
  // tokenizer instead, so this guard must run before model.getValue() copies
  // the entire buffer or either token provider begins parsing it.
  if (isLargeDocumentModel(model)) return Promise.resolve(null);

  const cacheKey = getSemanticTokenCacheKey(model);
  const cached = semanticTokenCache.get(cacheKey);
  if (cached?.versionId === model.getVersionId()) return cached.promise;

  const promise = createSemanticTokenPromise(model, cacheKey);
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

export function onSemanticTokensUpdated(listener: (modelUri: string) => void) {
  semanticTokenUpdateListeners.add(listener);
  return () => {
    semanticTokenUpdateListeners.delete(listener);
  };
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
