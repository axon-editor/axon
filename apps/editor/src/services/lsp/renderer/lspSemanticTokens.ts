/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as monaco from "monaco-editor";
import {
  addModelDisposeListener,
  detectLanguageServerLanguage,
} from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { createTextMateSemanticTokens } from "./textMateSemanticTokens";
import { canUseWorkspaceLanguageTools } from "./lspFileAccess";
import {
  decodeLanguageServerSemanticTokens,
  mergeHighlightTokenLayers,
  type HighlightTokenSet,
} from "./highlightTokenMerge";
import { isLargeDocumentModel } from "../../../shared/largeDocument";

const semanticTokenCache = new Map<
  string,
  {
    versionId: number;
    promise: Promise<HighlightTokenSet | null>;
  }
>();
const semanticTokenUpdateListeners = new Set<
  (model: monaco.editor.ITextModel) => void
>();
const TEXTMATE_LSP_COLD_MERGE_WAIT_MS = 80;
const TEXTMATE_LSP_WARM_MERGE_WAIT_MS = 30;

// A Monaco-language overlay merge races grammar tokens against the language
// server's semantic-token reply. Keeping that race fixed at 80ms gives every
// first-open in a cold session enough room for the server to warm, but it also
// makes each warm-server reopen wait the full 80ms and then paint twice (once
// grammar-only, once merged). I track the first usable overlay response per
// session and let later merges converge on the short wait, so a warm server
// resolves in ~5-30ms and the second paint is skipped entirely.
let languageServerSessionWarm = false;

// The cache trim on insert only bounds entries while the map is being written
// to. A closed file's model keeps its URI, so without disposal eviction the
// last ~80 whole-file token snapshots stay pinned in memory forever, including
// across HMR reloads. Dumping every entry for a disposed model URI on the
// buffer engine's dispose broadcast lets those snapshots be collected the
// moment the buffer can no longer be shown.
function discardSemanticTokensForModel(uri: string) {
  const prefix = `${uri}::`;
  for (const key of semanticTokenCache.keys()) {
    if (key.startsWith(prefix)) semanticTokenCache.delete(key);
  }
}
addModelDisposeListener(discardSemanticTokensForModel);

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

function waitForLanguageServerOverlay<T>(
  promise: Promise<T>,
  warm: boolean,
) {
  return Promise.race<T | typeof languageServerOverlayTimedOut>([
    promise,
    new Promise<typeof languageServerOverlayTimedOut>((resolve) => {
      window.setTimeout(
        () => resolve(languageServerOverlayTimedOut),
        // On a warm session the LSP typically responds in 5–30ms, so waiting
        // the full 80ms wastes time and causes a two-paint flash. A shorter
        // timeout on warm sessions halves the perceived coloring delay while
        // still protecting cold sessions from stale grammar-only paint.
        warm
          ? TEXTMATE_LSP_WARM_MERGE_WAIT_MS
          : TEXTMATE_LSP_COLD_MERGE_WAIT_MS,
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
  const decodeLanguageServerResult = (
    result: Awaited<typeof languageServerPromise>,
  ) =>
    result.ok && result.data.length > 0
      ? decodeLanguageServerSemanticTokens({
          data: result.data,
          legend: result.legend,
          languageId,
          resultId: result.resultId,
        })
      : null;

  return textMatePromise
    .then(async (textMateTokens) => {
      const result = textMateTokens
        ? await waitForLanguageServerOverlay(
            languageServerPromise,
            languageServerSessionWarm,
          )
        : await languageServerPromise;

      // Track whether this LSP session has responded at least once. Once it
      // has, later file opens can use the shorter warm wait instead of the
      // full 80ms cold budget.
      if (result && result !== languageServerOverlayTimedOut && result.ok) {
        languageServerSessionWarm = true;
      }

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
            const merged = mergeHighlightTokenLayers({
              lsp: decodeLanguageServerResult(lateResult),
              textMate: textMateTokens,
              resultId: lateResult.resultId,
            });
            semanticTokenCache.set(cacheKey, {
              versionId: model.getVersionId(),
              promise: Promise.resolve(merged),
            });

            // The first paint already consumed the grammar-only promise, so
            // replacing this cache entry cannot update the mounted decoration
            // collection by itself. I notify only after the same model version
            // has received a valid merged result; the editor then reads this
            // completed cache entry without starting another language-server
            // request or showing stale colors from an older buffer version.
            semanticTokenUpdateListeners.forEach((listener) => listener(model));
          })
          .catch(() => undefined);
        return textMateTokens;
      }
      if (!result) return textMateTokens;
      if (!result.ok || result.data.length === 0) return textMateTokens;

      return mergeHighlightTokenLayers({
        lsp: decodeLanguageServerResult(result),
        textMate: textMateTokens,
        resultId: result.resultId,
      });
    })
    .catch(async () => {
      try {
        const result = await languageServerPromise;
        if (!result.ok || result.data.length === 0) return null;
        return decodeLanguageServerResult(result);
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

export function onDidUpdateSemanticTokens(
  listener: (model: monaco.editor.ITextModel) => void,
) {
  semanticTokenUpdateListeners.add(listener);
  return {
    dispose: () => {
      semanticTokenUpdateListeners.delete(listener);
    },
  };
}
