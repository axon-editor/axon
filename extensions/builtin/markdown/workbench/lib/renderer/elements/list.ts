/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ListToken, ListItemToken, Token, InlineToken } from "../../parser/types";

// List renderer. Converts list tokens to HTML. Handles ordered lists,
// unordered lists, and task lists with checkboxes.

export function renderList(token: ListToken, onTaskToggle?: (line: number, checked: boolean) => void): string {
  const tag = token.ordered ? "ol" : "ul";
  const listClass = token.ordered ? "my-4 list-decimal space-y-1 pl-6" : "my-4 list-disc space-y-1 pl-6";
  const itemsHtml = token.items
    .map((item) => renderListItem(item, onTaskToggle))
    .join("");

  return `<${tag} data-source-line="${token.line}" class="${listClass}">${itemsHtml}</${tag}>`;
}

// Renders a single list item. Task list items get a checkbox before
// the content. The checkbox toggles the task state via the onTaskToggle
// callback.
function renderListItem(item: ListItemToken, onTaskToggle?: (line: number, checked: boolean) => void): string {
  let checkboxHtml = "";

  if (item.checked !== null) {
    const checkedAttr = item.checked ? "checked" : "";
    const disabledAttr = onTaskToggle ? "" : "disabled";
    checkboxHtml = `<input type="checkbox" ${checkedAttr} ${disabledAttr} data-task-line="${item.line}" data-task-checked="${item.checked}" class="mr-2 translate-y-[1px] cursor-pointer accent-[var(--axon-syntax-function)] disabled:cursor-default" />`;
  }

  const contentHtml = item.children
    .map((child) => renderBlock(child, onTaskToggle))
    .join("");

  return `<li class="pl-1" data-source-line="${item.line}">${checkboxHtml}${contentHtml}</li>`;
}

// Block renderer for list item children. Handles paragraphs, nested
// lists, and other block elements within list items.
function renderBlock(token: Token, onTaskToggle?: (line: number, checked: boolean) => void): string {
  switch (token.type) {
    case "paragraph":
      return `<p class="my-0">${token.children.map(renderInline).join("")}</p>`;
    case "list":
      return renderList(token, onTaskToggle);
    case "blockquote":
      return `<blockquote class="my-1 border-l-[3px] border-[var(--axon-panel-border)] py-0.5 pl-3 pr-2 text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-55">${token.children.map((c) => renderBlock(c, onTaskToggle)).join("")}</blockquote>`;
    default:
      return "";
  }
}

// Inline renderer for list item content.
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
