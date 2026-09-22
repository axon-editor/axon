/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken } from "../../parser/types";

// Link renderer. Handles external links, wiki links, and citations.
// External links open in the system browser. Wiki links and citations
// are handled by the React component's event delegation.

// External link icon SVG from Lucide.
const EXTERNAL_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

// Renders a link token. External links get the external link icon.
// Wiki links and citations get data attributes for event delegation.
export function renderLink(token: InlineToken): string {
  if (token.type !== "link") return "";

  const contentHtml = token.children.map(renderInline).join("");
  const isExternal = /^(https?:|mailto:|tel:)/i.test(token.href);

  if (isExternal) {
    return `<a href="${escapeAttr(token.href)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} rel="noreferrer" class="inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline">${contentHtml}${EXTERNAL_LINK_ICON}</a>`;
  }

  return `<a href="${escapeAttr(token.href)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} rel="noreferrer" class="inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline">${contentHtml}</a>`;
}

// Renders a wiki link token. Wiki links use data attributes for
// event delegation. The React component handles the click.
export function renderWikiLink(token: InlineToken): string {
  if (token.type !== "wikiLink") return "";

  const label = token.label ?? token.target;
  return `<a class="wiki-link inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-target="${escapeAttr(token.target)}">${escapeHtml(label)}</a>`;
}

// Renders a citation token. Citations use data attributes for
// event delegation.
export function renderCitation(token: InlineToken): string {
  if (token.type !== "citation") return "";

  return `<a class="citation inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-citation-id="${escapeAttr(token.id)}">[${escapeHtml(token.id)}]</a>`;
}

// Inline renderer for link content.
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
