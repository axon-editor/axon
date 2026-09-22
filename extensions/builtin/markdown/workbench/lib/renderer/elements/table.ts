/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TableToken, InlineToken } from "../../parser/types";

// Table renderer. Converts table tokens to HTML with proper alignment.
// Tables are wrapped in a scrollable container for narrow viewports.

export function renderTable(token: TableToken): string {
  const headerHtml = renderTableRow(token.headers, "th", token.align);
  const bodyHtml = token.rows
    .map((row) => renderTableRow(row, "td", token.align))
    .join("");

  return `<div data-source-line="${token.line}" class="my-5 overflow-x-auto rounded-md border border-[var(--axon-panel-border)]"><table class="w-full border-collapse text-left text-[13px]"><thead class="bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)]">${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
}

// Renders a table row (header or body). Each cell gets the appropriate
// alignment style based on the alignment row.
function renderTableRow(
  cells: InlineToken[][],
  tag: "th" | "td",
  align: ("left" | "center" | "right" | null)[],
): string {
  const cellHtml = cells
    .map((cell, i) => {
      const alignAttr = align[i] ? ` style="text-align: ${align[i]}"` : "";
      const borderClass =
        tag === "th"
          ? "border-b border-[var(--axon-panel-border)] px-3 py-2 font-medium"
          : "border-t border-[var(--axon-panel-border)] px-3 py-2";
      const content = cell.map(renderInline).join("");
      return `<${tag}${alignAttr} class="${borderClass}">${content}</${tag}>`;
    })
    .join("");

  return `<tr>${cellHtml}</tr>`;
}

// Inline renderer for table cell content. Handles text, bold, italic,
// code, links, and other inline formatting.
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
    case "wikiLink":
      return `<a class="wiki-link text-[var(--axon-syntax-function)]" data-target="${escapeAttr(token.target)}">${escapeHtml(token.label ?? token.target)}</a>`;
    case "citation":
      return `<a class="citation text-[var(--axon-syntax-function)]" data-citation-id="${escapeAttr(token.id)}">[${escapeHtml(token.id)}]</a>`;
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
