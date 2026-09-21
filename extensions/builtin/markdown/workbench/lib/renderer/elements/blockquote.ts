/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BlockquoteToken, Token, InlineToken } from "../types";

// Blockquote renderer. Handles both regular blockquotes and callout
// blocks. Callouts get a specific icon and color scheme based on their
// kind (note, tip, warning, etc.).

// Icons for each callout kind. These are SVG strings from Lucide.
const CALLOUT_ICONS: Record<string, string> = {
  note: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  tip: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
  important: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  caution: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22h20L12 2z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

// Colors for each callout kind. Uses theme variables where possible.
const CALLOUT_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  note: { border: "border-blue-500", bg: "bg-blue-500/10", icon: "text-blue-500" },
  tip: { border: "border-green-500", bg: "bg-green-500/10", icon: "text-green-500" },
  important: { border: "border-purple-500", bg: "bg-purple-500/10", icon: "text-purple-500" },
  warning: { border: "border-yellow-500", bg: "bg-yellow-500/10", icon: "text-yellow-500" },
  caution: { border: "border-red-500", bg: "bg-red-500/10", icon: "text-red-500" },
};

export function renderBlockquote(token: BlockquoteToken, onTaskToggle?: (line: number, checked: boolean) => void): string {
  // If this is a callout, render it with the callout style.
  if (token.callout) {
    return renderCallout(token, onTaskToggle);
  }

  // Regular blockquote.
  const childrenHtml = token.children
    .map((child) => renderBlock(child, onTaskToggle))
    .join("");

  return `<blockquote data-source-line="${token.line}" class="my-2 border-l-[3px] border-[var(--axon-panel-border)] bg-transparent py-0.5 pl-3 pr-2 text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-55 [&>p]:my-0 [&>p+p]:mt-2">${childrenHtml}</blockquote>`;
}

// Renders a callout block with icon, title, and content.
function renderCallout(token: BlockquoteToken, onTaskToggle?: (line: number, checked: boolean) => void): string {
  const kind = token.callout!;
  const style = CALLOUT_STYLES[kind] ?? CALLOUT_STYLES.note;
  const icon = CALLOUT_ICONS[kind] ?? CALLOUT_ICONS.note;

  const childrenHtml = token.children
    .map((child) => renderBlock(child, onTaskToggle))
    .join("");

  return `<aside data-source-line="${token.line}" data-callout="${kind}" class="my-4 rounded-md border ${style.border} ${style.bg} px-4 py-3"><div class="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase ${style.icon}">${icon}<span>${kind}</span></div><div class="[&>p]:my-0 [&>p+p]:mt-2">${childrenHtml}</div></aside>`;
}

// Block renderer for blockquote children.
function renderBlock(token: Token, onTaskToggle?: (line: number, checked: boolean) => void): string {
  switch (token.type) {
    case "paragraph":
      return `<p class="my-4">${token.children.map(renderInline).join("")}</p>`;
    case "list":
      // Import list renderer to avoid circular dependencies.
      return renderListForBlockquote(token, onTaskToggle);
    case "blockquote":
      return renderBlockquote(token, onTaskToggle);
    default:
      return "";
  }
}

// Inline renderer for blockquote content.
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

// Minimal list renderer for use within blockquotes. This avoids
// circular dependencies by duplicating the list rendering logic.
function renderListForBlockquote(token: Token, onTaskToggle?: (line: number, checked: boolean) => void): string {
  if (token.type !== "list") return "";
  const tag = token.ordered ? "ol" : "ul";
  const listClass = token.ordered ? "my-4 list-decimal space-y-1 pl-6" : "my-4 list-disc space-y-1 pl-6";
  const itemsHtml = token.items
    .map((item) => {
      if (item.type !== "listItem") return "";
      let checkboxHtml = "";
      if (item.checked !== null) {
        const checkedAttr = item.checked ? "checked" : "";
        checkboxHtml = `<input type="checkbox" ${checkedAttr} disabled data-task-line="${item.line}" class="mr-2 translate-y-[1px] cursor-pointer accent-[var(--axon-syntax-function)] disabled:cursor-default" />`;
      }
      const contentHtml = item.children
        .map((c) => renderBlock(c, onTaskToggle))
        .join("");
      return `<li class="pl-1" data-source-line="${item.line}">${checkboxHtml}${contentHtml}</li>`;
    })
    .join("");
  return `<${tag} class="${listClass}">${itemsHtml}</${tag}>`;
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
