/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ParagraphToken, InlineToken } from "../types";

// Paragraph renderer. Converts paragraph tokens to HTML. Paragraphs
// are the most common block element and contain inline content.

export function renderParagraph(token: ParagraphToken): string {
  const contentHtml = token.children.map(renderInline).join("");
  return `<p data-source-line="${token.line}" class="my-4">${contentHtml}</p>`;
}

// Inline renderer for paragraph content. Handles all inline formatting.
function renderInline(token: InlineToken): string {
  switch (token.type) {
    case "text":
      return escapeHtml(token.content);
    case "strong":
      return `<strong class="font-semibold text-[var(--axon-editor-foreground)]">${token.children.map(renderInline).join("")}</strong>`;
    case "emphasis":
      return `<em>${token.children.map(renderInline).join("")}</em>`;
    case "delete":
      return `<del>${token.children.map(renderInline).join("")}</del>`;
    case "inlineCode":
      return `<code class="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[13px] text-[var(--axon-syntax-function)]">${escapeHtml(token.content)}</code>`;
    case "link":
      return `<a href="${escapeAttr(token.href)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} rel="noreferrer" class="inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline">${token.children.map(renderInline).join("")}</a>`;
    case "image":
      return `<img src="${escapeAttr(token.src)}" alt="${escapeAttr(token.alt)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} class="my-4 inline-block align-middle" />`;
    case "math":
      return token.display
        ? `<span class="math-display">$$${escapeHtml(token.content)}$$</span>`
        : `<span class="math-inline">$${escapeHtml(token.content)}$</span>`;
    case "wikiLink":
      return `<a class="wiki-link inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-target="${escapeAttr(token.target)}">${escapeHtml(token.label ?? token.target)}</a>`;
    case "citation":
      return `<a class="citation inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-citation-id="${escapeAttr(token.id)}">[${escapeHtml(token.id)}]</a>`;
    case "footnoteReference":
      return `<sup class="footnote-ref"><a href="#fn-${escapeAttr(token.id)}" class="text-[var(--axon-syntax-function)]">[${escapeHtml(token.id)}]</a></sup>`;
    case "htmlInline":
      return token.content;
    case "softBreak":
      return "\n";
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
