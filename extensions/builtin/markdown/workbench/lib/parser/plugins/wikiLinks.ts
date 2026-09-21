/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken, MarkdownPlugin } from "../types";

// Wiki links plugin. Processes [[target]] and [[target|label]] syntax
// into wikiLink tokens. Also handles [@citation] syntax.
//
// Wiki links are a common convention in markdown note-taking apps like
// Obsidian and Logseq. They resolve to internal files within the workspace.
// The renderer handles the actual resolution based on the target string.

export function wikiLinksPlugin(): MarkdownPlugin {
  return {
    name: "wikiLinks",
    transformInline: (tokens: InlineToken[]) => processInline(tokens),
  };
}

// Recursively processes inline tokens to find wiki link and citation
// markers. Only text tokens are processed; container tokens have their
// children processed.
function processInline(tokens: InlineToken[]): InlineToken[] {
  const result: InlineToken[] = [];

  for (const token of tokens) {
    if (token.type === "text") {
      result.push(...parseWikiLinks(token.content));
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

// Parses wiki links and citations within a text string. Returns an
// array of text, wikiLink, and citation tokens.
function parseWikiLinks(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Look for [[ (wiki link).
    if (text[pos] === "[" && text[pos + 1] === "[") {
      const endIdx = text.indexOf("]]", pos + 2);
      if (endIdx !== -1) {
        const inner = text.slice(pos + 2, endIdx);
        const pipeIdx = inner.indexOf("|");

        if (pipeIdx === -1) {
          tokens.push({
            type: "wikiLink",
            target: inner.trim(),
          });
        } else {
          tokens.push({
            type: "wikiLink",
            target: inner.slice(0, pipeIdx).trim(),
            label: inner.slice(pipeIdx + 1).trim(),
          });
        }

        pos = endIdx + 2;
        continue;
      }
    }

    // Look for [@citation].
    if (text[pos] === "[" && text[pos + 1] === "@") {
      const endIdx = text.indexOf("]", pos + 2);
      if (endIdx !== -1) {
        tokens.push({
          type: "citation",
          id: text.slice(pos + 2, endIdx),
        });
        pos = endIdx + 1;
        continue;
      }
    }

    // Collect plain text until the next potential marker.
    let textEnd = pos + 1;
    while (
      textEnd < text.length &&
      !(text[textEnd] === "[" && text[textEnd + 1] === "[") &&
      !(text[textEnd] === "[" && text[textEnd + 1] === "@")
    ) {
      textEnd++;
    }

    if (textEnd > pos) {
      tokens.push({ type: "text", content: text.slice(pos, textEnd) });
    }
    pos = textEnd;
  }

  return tokens;
}
