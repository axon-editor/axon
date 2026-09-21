/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FootnoteDefinitionToken, Token, InlineToken } from "../types";

// Footnote renderer. Handles footnote definitions and references.
// Footnotes are rendered as a section at the bottom of the document
// with links back to their reference points.

// Renders a footnote definition. The definition is rendered as a list
// item with an anchor for back-references.
export function renderFootnoteDefinition(token: FootnoteDefinitionToken): string {
  const childrenHtml = token.children
    .map((child) => renderBlock(child))
    .join("");

  return `<li id="fn-${escapeAttr(token.id)}" class="my-2">${childrenHtml}<a href="#fnref-${escapeAttr(token.id)}" class="ml-1 text-[var(--axon-syntax-function)]">↩</a></li>`;
}

// Renders the footnotes section. This wraps all footnote definitions
// in an ordered list with a heading.
export function renderFootnotesSection(definitions: FootnoteDefinitionToken[]): string {
  if (definitions.length === 0) return "";

  const itemsHtml = definitions
    .map((def) => renderFootnoteDefinition(def))
    .join("");

  return `<section class="mt-10 border-t border-[var(--axon-panel-border)] pt-4 text-[12px] opacity-80"><h2 class="mb-3 text-[14px] font-semibold text-[var(--axon-editor-foreground)]">Footnotes</h2><ol class="list-decimal pl-6">${itemsHtml}</ol></section>`;
}

// Block renderer for footnote content.
function renderBlock(token: Token): string {
  switch (token.type) {
    case "paragraph":
      return `<p class="my-0">${token.children.map(renderInline).join("")}</p>`;
    default:
      return "";
  }
}

// Inline renderer for footnote content.
function renderInline(token: InlineToken): string {
  switch (token.type) {
    case "text":
      return escapeHtml(token.content);
    case "strong":
      return `<strong>${token.children.map(renderInline).join("")}</strong>`;
    case "emphasis":
      return `<em>${token.children.map(renderInline).join("")}</em>`;
    case "delete":
      return `<del>${token.children.map(renderInline).join("")}</del>`;
    case "inlineCode":
      return `<code class="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[13px] text-[var(--axon-syntax-function)]">${escapeHtml(token.content)}</code>`;
    case "link":
      return `<a href="${escapeAttr(token.href)}" class="text-[var(--axon-syntax-function)] underline-offset-4 hover:underline">${token.children.map(renderInline).join("")}</a>`;
    case "image":
      return `<img src="${escapeAttr(token.src)}" alt="${escapeAttr(token.alt)}" class="my-4 inline-block align-middle" />`;
    case "math":
      return `<span class="math-inline">$${escapeHtml(token.content)}$</span>`;
    case "htmlInline":
      return token.content;
    case "softBreak":
      return " ";
    case "hardBreak":
      return "<br />";
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

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
