/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shiki syntax highlighting wrapper. Warms up the highlighter once,
// then provides a synchronous codeToHtml function for code blocks.
//
// We use Shiki instead of Monaco's colorize because:
// 1. Shiki produces a standalone HTML string without needing DOM access
// 2. Shiki is lighter than Monaco (no editor dependency)
// 3. Shiki uses the same TextMate grammar engine as VS Code
// 4. The chat code blocks already use Shiki, so this shares infrastructure

type ShikiHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  loadLanguage: (grammar: unknown) => Promise<void>;
};

type ShikiCoreModule = {
  createHighlighterCore: (options: {
    themes: unknown[];
    langs: unknown[];
    engine: unknown;
  }) => Promise<ShikiHighlighter>;
};

type ShikiOnigurumaModule = {
  createOnigurumaEngine: (wasm: unknown) => Promise<unknown>;
};

type ShikiWasmModule = {
  default?: unknown;
  getWasmInstance?: unknown;
};

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

// Language alias map. Maps common shorthand names to the grammar
// names that Shiki expects.
const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  cjs: "javascript",
  cs: "csharp",
  js: "javascript",
  jsx: "javascriptreact",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  ts: "typescript",
  tsx: "typescriptreact",
  yml: "yaml",
};

// Normalizes a language identifier to the Shiki grammar name.
function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

// Initializes the Shiki highlighter. This is lazy-loaded on first use
// to avoid blocking the initial page load. The highlighter is cached
// for subsequent calls.
function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
      import("@shikijs/engine-oniguruma/wasm-inlined"),
      import("shiki/themes/github-dark.mjs"),
    ]).then(async ([coreModule, onigurumaModule, wasmModule, themeModule]) => {
      const core = coreModule as ShikiCoreModule;
      const oniguruma = onigurumaModule as ShikiOnigurumaModule;
      const wasm = wasmModule as ShikiWasmModule;
      const theme = (themeModule as { default: unknown }).default;

      const highlighter = await core.createHighlighterCore({
        themes: [theme],
        langs: [],
        engine: await oniguruma.createOnigurumaEngine(
          wasm.default ?? wasm.getWasmInstance,
        ),
      });

      // Preload common languages. These are the most frequently used
      // in markdown code blocks. We load them eagerly because the
      // first code block would block anyway.
      const commonLangs = [
        "javascript",
        "typescript",
        "python",
        "go",
        "rust",
        "html",
        "css",
        "json",
        "bash",
        "markdown",
      ];

      for (const lang of commonLangs) {
        try {
          const grammar = await import(
            /* @vite-ignore */ `shiki/langs/${lang}.mjs`
          );
          await highlighter.loadLanguage(grammar.default);
        } catch {
          // Language not available, skip silently.
        }
      }

      return highlighter;
    });
  }

  return highlighterPromise;
}

// Highlights a code block and returns HTML. Returns null if the
// highlighter has not loaded yet (the caller should show plain text).
export async function highlightCode(
  code: string,
  language: string,
): Promise<string | null> {
  try {
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, {
      lang: normalizeLanguage(language),
      theme: "github-dark",
    });
  } catch {
    return null;
  }
}

// Preloads the highlighter and common languages. Call this during
// idle time to warm up the highlighter before the first code block.
export function preloadHighlighter(): void {
  void getHighlighter();
}