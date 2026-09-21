/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MathBlockToken, InlineToken } from "../types";

// Math block renderer. Converts math tokens to KaTeX HTML. Uses the
// KaTeX library for rendering LaTeX math expressions.
//
// KaTeX is loaded lazily on first use to avoid blocking the initial
// page load. The rendered HTML is cached to avoid re-rendering the
// same expression.

let katexPromise: Promise<typeof import("katex")> | null = null;

async function getKatex() {
  if (!katexPromise) {
    katexPromise = import("katex");
  }
  return katexPromise;
}

// Renders a display math block ($$...$$). Returns HTML with KaTeX
// rendering. Falls back to a styled code block if KaTeX is not available.
export async function renderMathBlock(token: MathBlockToken): Promise<string> {
  try {
    const katex = await getKatex();
    const html = katex.renderToString(token.content, {
      displayMode: true,
      throwOnError: false,
      strict: false,
    });
    return `<div data-source-line="${token.line}" class="my-4 overflow-x-auto text-center">${html}</div>`;
  } catch {
    // Fallback: render as a styled code block.
    return `<div data-source-line="${token.line}" class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 text-center font-mono text-[13px] text-[var(--axon-editor-foreground)]">${escapeHtml(token.content)}</div>`;
  }
}

// Renders an inline math expression ($...$). Returns HTML with KaTeX
// rendering. Falls back to styled text if KaTeX is not available.
export async function renderInlineMath(token: InlineToken): Promise<string> {
  if (token.type !== "math") return "";

  try {
    const katex = await getKatex();
    const html = katex.renderToString(token.content, {
      displayMode: token.display,
      throwOnError: false,
      strict: false,
    });
    return token.display
      ? `<span class="math-display">${html}</span>`
      : `<span class="math-inline">${html}</span>`;
  } catch {
    // Fallback: render as styled code.
    return token.display
      ? `<span class="math-display rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 font-mono text-[13px]">${escapeHtml(token.content)}</span>`
      : `<span class="math-inline rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 font-mono text-[13px]">${escapeHtml(token.content)}</span>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
