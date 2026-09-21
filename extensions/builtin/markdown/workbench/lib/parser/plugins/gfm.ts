/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken, MarkdownPlugin } from "../types";

// GFM (GitHub Flavored Markdown) plugin. Handles strikethrough syntax
// using double tildes (~~text~~). Tables and task lists are handled
// at the block level in the tokenizer, so this plugin only deals with
// inline strikethrough.

export function gfmPlugin(): MarkdownPlugin {
  return {
    name: "gfm",
    transformInline: (tokens: InlineToken[]) => processInline(tokens),
  };
}

// Recursively processes inline tokens to find strikethrough syntax.
// Strikethrough uses ~~ before and after text. We scan text tokens
// for the ~~ markers and wrap matched content in delete tokens.
function processInline(tokens: InlineToken[]): InlineToken[] {
  const result: InlineToken[] = [];

  for (const token of tokens) {
    // Only text tokens can contain strikethrough markers. Container
    // tokens (bold, italic, etc.) need their children processed.
    if (token.type === "text") {
      result.push(...parseStrikethrough(token.content));
    } else if ("children" in token) {
      result.push({
        ...token,
        children: processInline(token.children),
      });
    } else {
      result.push(token);
    }
  }

  return result;
}

// Parses strikethrough markers within a text string. Returns an array
// of text and delete tokens.
function parseStrikethrough(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Look for opening ~~.
    const openIdx = text.indexOf("~~", pos);
    if (openIdx === -1) {
      // No more strikethrough markers. Push remaining text.
      tokens.push({ type: "text", content: text.slice(pos) });
      break;
    }

    // Push text before the ~~.
    if (openIdx > pos) {
      tokens.push({ type: "text", content: text.slice(pos, openIdx) });
    }

    // Look for closing ~~.
    const closeIdx = text.indexOf("~~", openIdx + 2);
    if (closeIdx === -1) {
      // No closing ~~, treat the ~~ as literal text.
      tokens.push({ type: "text", content: "~~" });
      pos = openIdx + 2;
      continue;
    }

    // Push the strikethrough content.
    const inner = text.slice(openIdx + 2, closeIdx);
    if (inner.length > 0) {
      tokens.push({ type: "delete", children: [{ type: "text", content: inner }] });
    }

    pos = closeIdx + 2;
  }

  return tokens;
}
