/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, FootnoteDefinitionToken } from "../types";
import type { RenderContext } from "./context";
import { renderHeading } from "./elements/heading";
import { renderParagraph } from "./elements/paragraph";
import { renderCodeBlock } from "./elements/code";
import { renderTable } from "./elements/table";
import { renderList } from "./elements/list";
import { renderBlockquote } from "./elements/blockquote";
import { renderFootnotesSection } from "./elements/footnote";
import { renderHtmlBlock } from "./elements/html";
import { renderHr } from "./elements/hr";

// Main renderer. Converts an array of tokens into an HTML string.
// The renderer processes tokens sequentially and handles math blocks
// asynchronously (KaTeX rendering).

export interface RenderOptions {
  // Whether to enable math rendering.
  math?: boolean;

  // Whether to enable Mermaid diagram rendering.
  mermaid?: boolean;
}

export async function render(
  tokens: Token[],
  context: RenderContext,
  options: RenderOptions = {},
): Promise<string> {
  const htmlParts: string[] = [];

  // Collect footnote definitions for the footnotes section.
  const footnotes: FootnoteDefinitionToken[] = [];

  for (const token of tokens) {
    htmlParts.push(await renderToken(token, context, options, footnotes));
  }

  // Append the footnotes section at the end.
  if (footnotes.length > 0) {
    htmlParts.push(renderFootnotesSection(footnotes));
  }

  return htmlParts.join("\n");
}

// Renders a single block token to HTML.
async function renderToken(
  token: Token,
  context: RenderContext,
  options: RenderOptions,
  footnotes: FootnoteDefinitionToken[],
): Promise<string> {
  // Resolve asset paths relative to the markdown file.

  switch (token.type) {
    case "heading":
      return renderHeading(token);

    case "paragraph":
      return renderParagraph(token);

    case "code":
      // Code blocks are rendered synchronously. The highlighted HTML
      // is provided by the React component after async Shiki loading.
      return renderCodeBlock(token, null);

    case "mathBlock": {
      if (options.math === false) {
        return `<pre class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 text-[13px] text-[var(--axon-editor-foreground)]">${escapeHtml(token.content)}</pre>`;
      }
      try {
        const { renderMathBlock } = await import("./elements/math");
        return await renderMathBlock(token);
      } catch {
        return `<pre class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 text-[13px] text-[var(--axon-editor-foreground)]">${escapeHtml(token.content)}</pre>`;
      }
    }

    case "list":
      return renderList(token, context.onTaskToggle);

    case "blockquote":
      return renderBlockquote(token, context.onTaskToggle);

    case "table":
      return renderTable(token);

    case "thematicBreak":
      return renderHr(token);

    case "frontmatter":
      // Frontmatter is stripped by the parser plugin. If it somehow
      // reaches the renderer, ignore it.
      return "";

    case "footnoteDefinition":
      // Collect footnotes for the section at the end.
      footnotes.push(token);
      return "";

    case "htmlBlock":
      return renderHtmlBlock(token);

    default:
      return "";
  }
}

// Synchronous render for use cases where async is not needed (e.g.,
// testing, static output). Math blocks are rendered as plain text.
export function renderSync(
  tokens: Token[],
  context: RenderContext,
): string {
  const htmlParts: string[] = [];
  const footnotes: FootnoteDefinitionToken[] = [];

  for (const token of tokens) {
    htmlParts.push(renderTokenSync(token, context, footnotes));
  }

  if (footnotes.length > 0) {
    htmlParts.push(renderFootnotesSection(footnotes));
  }

  return htmlParts.join("\n");
}

// Synchronous token renderer. Math blocks are rendered as plain text
// since KaTeX requires async loading.
function renderTokenSync(
  token: Token,
  context: RenderContext,
  footnotes: FootnoteDefinitionToken[],
): string {
  switch (token.type) {
    case "heading":
      return renderHeading(token);
    case "paragraph":
      return renderParagraph(token);
    case "code":
      return renderCodeBlock(token, null);
    case "mathBlock":
      return `<pre class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 text-[13px] text-[var(--axon-editor-foreground)]">${escapeHtml(token.content)}</pre>`;
    case "list":
      return renderList(token, context.onTaskToggle);
    case "blockquote":
      return renderBlockquote(token, context.onTaskToggle);
    case "table":
      return renderTable(token);
    case "thematicBreak":
      return renderHr(token);
    case "frontmatter":
      return "";
    case "footnoteDefinition":
      footnotes.push(token);
      return "";
    case "htmlBlock":
      return renderHtmlBlock(token);
    default:
      return "";
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

// Re-export types and utilities.
export type { RenderContext } from "./context";
export { resolveMarkdownPath, isVideoPath } from "./context";
export { highlightCode, preloadHighlighter } from "./highlight";
