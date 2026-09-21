/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodeToken, InlineToken } from "../types";

// Code block renderer. Handles both fenced code blocks and inline code.
// Fenced blocks use Shiki for syntax highlighting, while inline code
// gets a simple monospace style.

// Renders a fenced code block. The highlighted HTML is injected via
// dangerouslySetInnerHTML in the React component. This function
// produces the full HTML string for the code block.
export function renderCodeBlock(token: CodeToken, highlightedHtml: string | null): string {
  const langBadge =
    token.language && token.language !== "text"
      ? `<span class="absolute right-2 top-2 rounded bg-[var(--axon-editor-background)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-0 transition-opacity group-hover:opacity-55">${escapeHtml(token.language)}</span>`
      : "";

  const codeContent = highlightedHtml
    ? `<code>${highlightedHtml}</code>`
    : `<code>${escapeHtml(token.content)}</code>`;

  return `<div data-source-line="${token.line}" class="group relative my-4 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]"><pre class="m-0 overflow-x-auto p-4 text-[13px] leading-6 text-[var(--axon-editor-foreground)]">${codeContent}</pre>${langBadge}<div class="absolute right-2 top-2 flex items-center gap-2"><button type="button" data-copy="${escapeAttr(token.content)}" class="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 group-hover:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button></div></div>`;
}

// Renders inline code within a paragraph or heading.
export function renderInlineCode(token: InlineToken): string {
  if (token.type !== "inlineCode") return "";
  return `<code class="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[13px] text-[var(--axon-syntax-function)]">${escapeHtml(token.content)}</code>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
