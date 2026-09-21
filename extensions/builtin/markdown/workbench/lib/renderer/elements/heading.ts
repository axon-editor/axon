/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { HeadingToken, InlineToken } from "../types";

// Heading renderer. Converts heading tokens to HTML with slug IDs
// for anchor links. Headings use scroll-mt-4 to account for the
// sticky toolbar when scrolling to anchors.

export function renderHeading(token: HeadingToken): string {
  const tag = `h${token.level}`;
  const className = HEADING_CLASSES[token.level];
  const inlineHtml = token.children.map(renderInline).join("");

  return `<${tag} id="${escapeAttr(token.id)}" data-source-line="${token.line}" class="${className}">${inlineHtml}</${tag}>`;
}

// Inline renderer for heading content. Handles text, bold, italic,
// code, and other inline formatting within headings.
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
      return `<code class="inline">${escapeHtml(token.content)}</code>`;
    case "link":
      return `<a href="${escapeAttr(token.href)}" title="${token.title ? escapeAttr(token.title) : ""}">${token.children.map(renderInline).join("")}</a>`;
    case "image":
      return `<img src="${escapeAttr(token.src)}" alt="${escapeAttr(token.alt)}" title="${token.title ? escapeAttr(token.title) : ""}" />`;
    case "math":
      return token.display
        ? `<span class="math-display">$$${escapeHtml(token.content)}$$</span>`
        : `<span class="math-inline">$${escapeHtml(token.content)}$</span>`;
    case "wikiLink":
      return `<a class="wiki-link" data-target="${escapeAttr(token.target)}">${escapeHtml(token.label ?? token.target)}</a>`;
    case "citation":
      return `<a class="citation" data-citation-id="${escapeAttr(token.id)}">[${escapeHtml(token.id)}]</a>`;
    case "footnoteReference":
      return `<sup class="footnote-ref"><a href="#fn-${escapeAttr(token.id)}">[${escapeHtml(token.id)}]</a></sup>`;
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

// Heading CSS classes. Each level has appropriate sizing and spacing.
// The scroll-mt-4 class adds top padding when scrolling to the heading
// to account for the sticky toolbar.
const HEADING_CLASSES: Record<number, string> = {
  1: "scroll-mt-4 mb-5 border-b border-[var(--axon-panel-border)] pb-3 text-[26px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  2: "scroll-mt-4 mb-3 mt-8 border-b border-[var(--axon-panel-border)] pb-2 text-[20px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  3: "scroll-mt-4 mb-2 mt-6 text-[16px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  4: "scroll-mt-4 mb-2 mt-5 text-[14px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  5: "scroll-mt-4 mb-2 mt-4 text-[13px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  6: "scroll-mt-4 mb-2 mt-3 text-[12px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
};

// Escapes HTML special characters.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Escapes attribute values for use in HTML attributes.
function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Re-export renderInline for use by other element renderers.
export { renderInline };
