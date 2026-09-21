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

let highlighterPromise: Promise<{
  codeToHtml: (code: string, lang: string) => string;
}> | null = null;

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
async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore } = await import("shiki/core");
      const { createOnigurumaEngine } = await import(
        "@shikijs/engine-oniguruma/wasm-inlined"
      );

      const highlighter = await createHighlighterCore({
        themes: [import("shiki/themes/github-dark")],
        langs: [],
        engine: createOnigurumaEngine(),
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
          await highlighter.loadLanguage(lang);
        } catch {
          // Language not available, skip silently.
        }
      }

      return {
        codeToHtml: (code: string, lang: string) => {
          const normalized = normalizeLanguage(lang);
          try {
            return highlighter.codeToHtml(code, {
              lang: normalized,
              theme: "github-dark",
            });
          } catch {
            // If highlighting fails, return escaped plain text.
            return `<pre><code>${escapeHtml(code)}</code></pre>`;
          }
        },
      };
    })();
  }

  return highlighterPromise;
}

// Escapes HTML special characters. Used as a fallback when Shiki
// cannot highlight a language.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Highlights a code block and returns HTML. Returns null if the
// highlighter has not loaded yet (the caller should show plain text).
export async function highlightCode(
  code: string,
  language: string,
): Promise<string | null> {
  try {
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, language);
  } catch {
    return null;
  }
}

// Preloads the highlighter and common languages. Call this during
// idle time to warm up the highlighter before the first code block.
export function preloadHighlighter(): void {
  void getHighlighter();
}
