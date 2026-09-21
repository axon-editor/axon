/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken, MarkdownPlugin } from "../types";

// Math plugin. Handles inline math expressions using $...$ syntax.
// Block-level math ($$...$$) is handled in the tokenizer. This plugin
// processes inline math within text tokens.
//
// We use $$ for display math (centered, larger) and $ for inline math
// (within text flow). The renderer decides how to render these based
// on the display flag.

export function mathPlugin(): MarkdownPlugin {
  return {
    name: "math",
    transformInline: (tokens: InlineToken[]) => processInline(tokens),
  };
}

// Recursively processes inline tokens to find math markers. Only text
// tokens are processed; container tokens have their children processed.
function processInline(tokens: InlineToken[]): InlineToken[] {
  const result: InlineToken[] = [];

  for (const token of tokens) {
    if (token.type === "text") {
      result.push(...parseMath(token.content));
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

// Parses math markers within a text string. Returns an array of text
// and math tokens.
function parseMath(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Look for $$ first (display math) since $ is a prefix of $$.
    if (text[pos] === "$" && text[pos + 1] === "$") {
      const closeIdx = text.indexOf("$$", pos + 2);
      if (closeIdx !== -1) {
        const content = text.slice(pos + 2, closeIdx);
        if (content.length > 0) {
          tokens.push({ type: "math", content, display: true });
        }
        pos = closeIdx + 2;
        continue;
      }
    }

    // Look for single $ (inline math).
    if (text[pos] === "$") {
      const closeIdx = text.indexOf("$", pos + 1);
      if (closeIdx !== -1 && closeIdx > pos + 1) {
        const content = text.slice(pos + 1, closeIdx);
        if (content.length > 0 && !content.startsWith(" ")) {
          tokens.push({ type: "math", content, display: false });
          pos = closeIdx + 1;
          continue;
        }
      }
    }

    // Collect plain text until the next $.
    let textEnd = pos + 1;
    while (textEnd < text.length && text[textEnd] !== "$") {
      textEnd++;
    }
    tokens.push({ type: "text", content: text.slice(pos, textEnd) });
    pos = textEnd;
  }

  return tokens;
}
