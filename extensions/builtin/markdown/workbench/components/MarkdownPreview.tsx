/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Markdown preview component. This is the main entry point for rendering
// markdown content. It uses the custom parser and renderer pipeline
// instead of react-markdown.
//
// The component parses markdown content to tokens, renders them to HTML,
// and patches the DOM via morphdom. This avoids the flickering issues
// caused by React re-rendering the entire markdown tree.

import { useCallback, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { parse, type Token, type InlineToken, type FootnoteDefinitionToken } from "../lib/parser";
import { preloadHighlighter } from "../lib/renderer/highlight";
import { morphdom, captureImageDimensions, applyImageDimensions } from "../lib/sync/morphdom";
import {
  onMarkdownScroll,
  publishMarkdownScroll,
  findNearestSourceLine,
  findVisibleSourceLine,
} from "../lib/sync/scrollSync";
import MarkdownPreviewToolbar from "./MarkdownPreviewToolbar";

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
  folderPath: string | null;
  onOpenFile?: (path: string) => void;
  onContentChange?: (content: string) => void;
}

export default function MarkdownPreview({
  content,
  filePath,
  folderPath,
  onOpenFile,
  onContentChange,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const suppressScrollRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  // Preload the Shiki highlighter during idle time.
  useEffect(() => {
    preloadHighlighter();
  }, []);

  // Subscribe to editor scroll events for bidirectional sync.
  useEffect(
    () =>
      onMarkdownScroll((event) => {
        if (event.filePath !== filePath || event.source !== "editor") return;
        const container = containerRef.current;
        if (!container) return;

        const target = findNearestSourceLine(container, event.line);
        if (!target) return;

        suppressScrollRef.current = true;
        container.scrollTop = Math.max(0, target.offsetTop - 16);
        window.requestAnimationFrame(() => {
          suppressScrollRef.current = false;
        });
      }),
    [filePath],
  );

  // Report preview scroll position to the editor.
  const handleScroll = useCallback(() => {
    if (suppressScrollRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const container = containerRef.current;
      if (!container) return;

      const line = findVisibleSourceLine(container);
      if (line !== null) {
        publishMarkdownScroll({ filePath, line, source: "preview" });
      }
    });
  }, [filePath]);

  // Cleanup scroll frame on unmount.
  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  // Parse and render on content change. Uses morphdom to patch the DOM
  // instead of replacing innerHTML. Debounced to avoid main-thread
  // blocking on fast typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      // Capture image dimensions before morphing to prevent layout shifts.
      const imageDims = captureImageDimensions(container);

      // Parse markdown to tokens.
      const { tokens } = parse(content, {
        gfm: true,
        math: true,
        frontmatter: true,
        callouts: true,
        wikiLinks: true,
        sourceLines: true,
      });

      // Render tokens to HTML string.
      const html = renderSync(tokens, {
        filePath,
        folderPath,
        onTaskToggle: (line, checked) => {
          onContentChange?.(toggleTask(content, line, checked));
        },
      });

    // Patch the DOM via morphdom.
    morphdom(container, html);

    // Restore image dimensions to prevent layout shifts.
    applyImageDimensions(container, imageDims);
    }, 120);

    return () => clearTimeout(timer);
  }, [content, filePath, folderPath, onContentChange]);

  // Event delegation for link clicks, task toggles, and other
  // interactive elements.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Task checkbox toggle.
      if (
        target.tagName === "INPUT" &&
        target.getAttribute("type") === "checkbox"
      ) {
        const line = Number(target.getAttribute("data-task-line"));
        const checked = (target as HTMLInputElement).checked;
        if (Number.isFinite(line)) {
          onContentChange?.(toggleTask(content, line, checked));
        }
        return;
      }

      // Link click.
      const anchor = target.closest("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        const wikiTarget = anchor.getAttribute("data-target");
        const citationId = anchor.getAttribute("data-citation-id");

        if (href?.startsWith("#")) {
          e.preventDefault();
          const id = href.slice(1);
          const el = containerRef.current?.querySelector(
            `#${CSS.escape(id)}`,
          );
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        if (wikiTarget) {
          e.preventDefault();
          onOpenFile?.(wikiTarget);
          return;
        }

        if (citationId) {
          e.preventDefault();
          return;
        }

        if (href && /^(https?:|mailto:|tel:)/i.test(href)) {
          e.preventDefault();
          window.axon?.openExternalLink(href);
          return;
        }
      }
    },
    [content, onContentChange, onOpenFile],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]">
      <MarkdownPreviewToolbar articleRef={articleRef} filePath={filePath} />
      <div
        ref={(el) => {
          containerRef.current = el;
          articleRef.current = el;
        }}
        onScroll={handleScroll}
        onClick={handleClick}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Synchronous render pipeline
// ---------------------------------------------------------------------------

// Synchronous render for use in the React effect. Math blocks are
// rendered as plain text since KaTeX requires async loading.
function renderSync(
  tokens: Token[],
  context: {
    filePath: string;
    folderPath: string | null;
    onTaskToggle?: (line: number, checked: boolean) => void;
  },
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

// Synchronous token renderer.
function renderTokenSync(
  token: Token,
  context: {
    filePath: string;
    folderPath: string | null;
    onTaskToggle?: (line: number, checked: boolean) => void;
  },
  footnotes: FootnoteDefinitionToken[],
): string {
  switch (token.type) {
    case "heading":
      return renderHeadingSync(token);
    case "paragraph":
      return renderParagraphSync(token);
    case "code":
      return renderCodeBlockSync(token);
    case "mathBlock":
      return `<pre class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 text-[13px] text-[var(--axon-editor-foreground)]">${escapeHtml(token.content)}</pre>`;
    case "list":
      return renderListSync(token, context.onTaskToggle);
    case "blockquote":
      return renderBlockquoteSync(token);
    case "table":
      return renderTableSync(token);
    case "thematicBreak":
      return `<hr data-source-line="${token.line}" class="my-8 border-[var(--axon-panel-border)]" />`;
    case "frontmatter":
      return "";
    case "footnoteDefinition":
      footnotes.push(token);
      return "";
    case "htmlBlock":
      return `<div data-source-line="${token.line}">${sanitizeHtml(token.content)}</div>`;
    default:
      return "";
  }
}

// Inline renderer for sync mode.
function renderInlineSync(token: InlineToken): string {
  switch (token.type) {
    case "text":
      return escapeHtml(token.content);
    case "strong":
      return `<strong class="font-semibold text-[var(--axon-editor-foreground)]">${token.children.map(renderInlineSync).join("")}</strong>`;
    case "emphasis":
      return `<em>${token.children.map(renderInlineSync).join("")}</em>`;
    case "delete":
      return `<del>${token.children.map(renderInlineSync).join("")}</del>`;
    case "inlineCode":
      return `<code class="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[13px] text-[var(--axon-syntax-function)]">${escapeHtml(token.content)}</code>`;
    case "link":
      return `<a href="${escapeAttr(token.href)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} rel="noreferrer" class="inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline">${token.children.map(renderInlineSync).join("")}</a>`;
    case "image":
      return `<img src="${escapeAttr(token.src)}" alt="${escapeAttr(token.alt)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} class="my-4 inline-block align-middle" />`;
    case "math":
      return `<span class="math-inline">$${escapeHtml(token.content)}$</span>`;
    case "wikiLink":
      return `<a class="wiki-link inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-target="${escapeAttr(token.target)}">${escapeHtml(token.label ?? token.target)}</a>`;
    case "citation":
      return `<a class="citation inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline" data-citation-id="${escapeAttr(token.id)}">[${escapeAttr(token.id)}]</a>`;
    case "footnoteReference":
      return `<sup class="footnote-ref"><a href="#fn-${escapeAttr(token.id)}" class="text-[var(--axon-syntax-function)]">[${escapeHtml(token.id)}]</a></sup>`;
    case "htmlInline":
      return sanitizeHtml(token.content);
    case "softBreak":
      return "\n";
    case "hardBreak":
      return "<br />";
    default:
      return "";
  }
}

// Sync heading renderer.
function renderHeadingSync(token: Token & { type: "heading" }): string {
  const tag = `h${token.level}`;
  const classes = [
    "scroll-mt-4 mb-5 border-b border-[var(--axon-panel-border)] pb-3 text-[26px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
    "scroll-mt-4 mb-3 mt-8 border-b border-[var(--axon-panel-border)] pb-2 text-[20px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
    "scroll-mt-4 mb-2 mt-6 text-[16px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
    "scroll-mt-4 mb-2 mt-5 text-[14px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
    "scroll-mt-4 mb-2 mt-4 text-[13px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
    "scroll-mt-4 mb-2 mt-3 text-[12px] font-semibold leading-tight text-[var(--axon-editor-foreground)]",
  ];
  const className = classes[token.level - 1] ?? classes[0];
  return `<${tag} id="${escapeAttr(token.id)}" data-source-line="${token.line}" class="${className}">${token.children.map(renderInlineSync).join("")}</${tag}>`;
}

// Sync paragraph renderer.
function renderParagraphSync(token: Token & { type: "paragraph" }): string {
  return `<p data-source-line="${token.line}" class="my-4">${token.children.map(renderInlineSync).join("")}</p>`;
}

// Sync code block renderer.
function renderCodeBlockSync(token: Token & { type: "code" }): string {
  const langBadge = token.language && token.language !== "text"
    ? `<span class="absolute right-2 top-2 rounded bg-[var(--axon-editor-background)] px-1.5 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-0 transition-opacity group-hover:opacity-55">${escapeHtml(token.language)}</span>`
    : "";
  return `<div data-source-line="${token.line}" class="group relative my-4 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]"><pre class="m-0 overflow-x-auto p-4 text-[13px] leading-6 text-[var(--axon-editor-foreground)]"><code>${escapeHtml(token.content)}</code></pre>${langBadge}</div>`;
}

// Sync list renderer.
function renderListSync(token: Token & { type: "list" }, _onTaskToggle?: (line: number, checked: boolean) => void): string {
  const tag = token.ordered ? "ol" : "ul";
  const listClass = token.ordered ? "my-4 list-decimal space-y-1 pl-6" : "my-4 list-disc space-y-1 pl-6";
  const itemsHtml = token.items
    .map((item) => {
      let checkbox = "";
      if (item.checked !== null) {
        const checked = item.checked ? "checked" : "";
        checkbox = `<input type="checkbox" ${checked} data-task-line="${item.line}" class="mr-2 translate-y-[1px] cursor-pointer accent-[var(--axon-syntax-function)]" />`;
      }
      const content = item.children.map((c) => renderTokenSync(c, { filePath: "", folderPath: null }, [])).join("");
      return `<li class="pl-1" data-source-line="${item.line}">${checkbox}${content}</li>`;
    })
    .join("");
  return `<${tag} data-source-line="${token.line}" class="${listClass}">${itemsHtml}</${tag}>`;
}

// Sync blockquote renderer.
function renderBlockquoteSync(token: Token & { type: "blockquote" }): string {
  if (token.callout) {
    const childrenHtml = token.children.map((c) => renderTokenSync(c, { filePath: "", folderPath: null }, [])).join("");
    return `<aside data-source-line="${token.line}" data-callout="${token.callout}" class="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-4 py-3"><div class="mb-2 text-[10px] font-semibold uppercase text-[var(--axon-syntax-function)]">${token.callout}</div><div class="[&>p]:my-0 [&>p+p]:mt-2">${childrenHtml}</div></aside>`;
  }
  const childrenHtml = token.children.map((c) => renderTokenSync(c, { filePath: "", folderPath: null }, [])).join("");
  return `<blockquote data-source-line="${token.line}" class="my-2 border-l-[3px] border-[var(--axon-panel-border)] bg-transparent py-0.5 pl-3 pr-2 text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-55 [&>p]:my-0 [&>p+p]:mt-2">${childrenHtml}</blockquote>`;
}

// Sync table renderer.
function renderTableSync(token: Token & { type: "table" }): string {
  const headerHtml = token.headers
    .map((row, i) => {
      const align = token.align[i] ? ` style="text-align: ${token.align[i]}"` : "";
      return `<th${align} class="border-b border-[var(--axon-panel-border)] px-3 py-2 font-medium">${row.map(renderInlineSync).join("")}</th>`;
    })
    .join("");
  const bodyHtml = token.rows
    .map((row) => {
      const cells = row
        .map((cell, i) => {
          const align = token.align[i] ? ` style="text-align: ${token.align[i]}"` : "";
          return `<td${align} class="border-t border-[var(--axon-panel-border)] px-3 py-2">${cell.map(renderInlineSync).join("")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div data-source-line="${token.line}" class="my-5 overflow-x-auto rounded-md border border-[var(--axon-panel-border)]"><table class="w-full border-collapse text-left text-[13px]"><thead class="bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)]"><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

// Sync footnotes section renderer.
function renderFootnotesSection(definitions: FootnoteDefinitionToken[]): string {
  if (definitions.length === 0) return "";
  const itemsHtml = definitions
    .map((def) => {
      const childrenHtml = def.children.map((c) => renderTokenSync(c, { filePath: "", folderPath: null }, [])).join("");
      return `<li id="fn-${escapeAttr(def.id)}" class="my-2">${childrenHtml}<a href="#fnref-${escapeAttr(def.id)}" class="ml-1 text-[var(--axon-syntax-function)]">\u21A9</a></li>`;
    })
    .join("");
  return `<section class="mt-10 border-t border-[var(--axon-panel-border)] pt-4 text-[12px] opacity-80"><h2 class="mb-3 text-[14px] font-semibold text-[var(--axon-editor-foreground)]">Footnotes</h2><ol class="list-decimal pl-6">${itemsHtml}</ol></section>`;
}

// Toggles a task checkbox at a specific line number.
function toggleTask(content: string, line: number, checked: boolean): string {
  const lines = content.split("\n");
  const targetLine = lines[line - 1];
  if (!targetLine) return content;

  const replacement = checked ? "[x]" : "[ ]";
  lines[line - 1] = targetLine.replace(
    /^\s*([-*+])\s+\[[ xX]\]/,
    `$1 ${replacement}`,
  );

  return lines.join("\n");
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
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
