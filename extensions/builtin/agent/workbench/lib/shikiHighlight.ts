/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Lazy Shiki highlighter for chat code blocks. This reuses the same Oniguruma
// WASM engine and github-dark theme as the editor's TextMate semantic tokens,
// but loads grammars independently so the chat can highlight code without
// waiting for the full LSP pipeline to warm up.

type ShikiHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  loadLanguage: (grammar: unknown) => Promise<void>;
};

type ShikiModule = {
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
const loadedLanguages = new Set<string>();

// Maps common language aliases to Shiki grammar names. Languages not listed
// here are passed through as-is since Shiki handles most standard names.
const languageAlias: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rb: "ruby",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  docker: "dockerfile",
  hcl: "terraform",
};

function resolveLanguage(lang: string): string {
  return languageAlias[lang.toLowerCase()] ?? lang.toLowerCase();
}

function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
      import("@shikijs/engine-oniguruma/wasm-inlined"),
      import("shiki/themes/github-dark.mjs"),
    ]).then(async ([coreModule, onigurumaModule, wasmModule, githubDark]) => {
      const oniguruma = onigurumaModule as ShikiOnigurumaModule;
      const wasm = wasmModule as ShikiWasmModule;
      const shiki = coreModule as ShikiModule;
      return shiki.createHighlighterCore({
        themes: [(githubDark as { default: unknown }).default],
        langs: [],
        engine: await oniguruma.createOnigurumaEngine(
          wasm.default ?? wasm.getWasmInstance,
        ),
      });
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  language: string,
): Promise<string> {
  const resolved = resolveLanguage(language);
  const highlighter = await getHighlighter();

  // Load the grammar on demand. Shiki throws if you highlight with a language
  // that was never loaded, so we lazy-load each grammar once and cache the
  // loaded set to avoid redundant imports.
  if (!loadedLanguages.has(resolved)) {
    try {
      const grammar = await import(`shiki/langs/${resolved}.mjs`);
      await highlighter.loadLanguage(grammar.default);
      loadedLanguages.add(resolved);
    } catch {
      // If the grammar doesn't exist in Shiki, fall back to plaintext.
      // The caller will still get a properly formatted code block, just
      // without syntax coloring.
      return escapeHtml(code);
    }
  }

  return highlighter.codeToHtml(code, {
    lang: resolved,
    theme: "github-dark",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
