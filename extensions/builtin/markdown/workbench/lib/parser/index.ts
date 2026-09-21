/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, InlineToken, ParseOptions } from "./types";
import { tokenizeBlocks } from "./tokenizer";
import { createPlugins } from "./plugins";
import { extractFrontmatter } from "./plugins/frontmatter";

// Public API for the Axon markdown parser. Converts markdown text into
// an array of typed tokens that the renderer can convert to HTML.
//
// The parser works in three phases:
// 1. Extract frontmatter (if enabled)
// 2. Tokenize blocks and inlines
// 3. Run plugins to transform the token tree

export interface ParseResult {
  tokens: Token[];
  frontmatter: Record<string, unknown> | null;
}

export function parse(
  content: string,
  options: ParseOptions = {},
): ParseResult {
  // Phase 1: Extract frontmatter if enabled.
  let markdownContent = content;
  let frontmatter: Record<string, unknown> | null = null;

  if (options.frontmatter !== false) {
    const extracted = extractFrontmatter(content);
    frontmatter = extracted.frontmatter;
    markdownContent = extracted.content;
  }

  // Phase 2: Tokenize blocks and inlines.
  let tokens = tokenizeBlocks(markdownContent, options);

  // Phase 3: Run plugins in order. Inline plugins run first because
  // some block plugins (like callouts) modify the tree based on
  // inline content.
  const plugins = createPlugins(options);

  for (const plugin of plugins) {
    if (plugin.transformInline) {
      tokens = transformInlineRecursive(tokens, plugin.transformInline);
    }
    if (plugin.transformBlock) {
      tokens = plugin.transformBlock(tokens);
    }
  }

  // Phase 4: Generate heading IDs. We do this after all plugins
  // have run so the heading text is final.
  tokens = generateHeadingIds(tokens);

  return { tokens, frontmatter };
}

// Recursively applies an inline transform to all tokens that contain
// inline children.
function transformInlineRecursive(
  tokens: Token[],
  transform: (tokens: InlineToken[]) => InlineToken[],
): Token[] {
  return tokens.map((token) => {
    if ("children" in token && Array.isArray(token.children)) {
      if (token.type === "heading" || token.type === "paragraph") {
        return {
          ...token,
          children: transform(token.children as InlineToken[]),
        };
      }

      // Block children: recurse into block children.
      return {
        ...token,
        children: transformInlineRecursive(token.children as Token[], transform),
      };
    }

    return token;
  });
}

// Generates unique slug IDs for heading tokens. Uses the heading text
// to create URL-friendly slugs, with deduplication for duplicate headings.
function generateHeadingIds(tokens: Token[]): Token[] {
  const slugCounts = new Map<string, number>();

  return tokens.map((token) => {
    if (token.type === "heading") {
      const slug = createSlug(token.children);
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      const id = count === 0 ? slug : `${slug}-${count}`;
      return { ...token, id };
    }

    // Recurse into block children (blockquote, footnoteDefinition).
    if (
      (token.type === "blockquote" ||
        token.type === "footnoteDefinition") &&
      "children" in token &&
      Array.isArray(token.children)
    ) {
      return {
        ...token,
        children: generateHeadingIds(token.children as Token[]),
      };
    }

    return token;
  });
}

// Creates a URL-friendly slug from inline tokens. Extracts text content,
// normalizes Unicode, removes special characters, and collapses spaces.
function createSlug(
  children: import("./types").InlineToken[],
): string {
  const text = extractText(children);
  return text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Recursively extracts plain text from inline tokens.
function extractText(children: import("./types").InlineToken[]): string {
  return children
    .map((child) => {
      if (child.type === "text") return child.content;
      if ("children" in child) return extractText(child.children);
      return "";
    })
    .join("");
}

// Re-export types for convenience.
export type {
  Token,
  InlineToken,
  ParseOptions,
  HeadingToken,
  ParagraphToken,
  CodeToken,
  MathBlockToken,
  ListToken,
  ListItemToken,
  BlockquoteToken,
  TableToken,
  ThematicBreakToken,
  FrontmatterToken,
  FootnoteDefinitionToken,
  HtmlBlockToken,
  CalloutKind,
  MarkdownPlugin,
} from "./types";
