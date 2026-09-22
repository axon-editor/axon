/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, MarkdownPlugin } from "../types";

// Source lines plugin. Ensures all block tokens have their line numbers
// set correctly for scroll sync. The tokenizer already sets line numbers
// on block tokens, but this plugin can be used to verify or adjust them.
//
// The line numbers are used by the scroll sync system to map between
// editor positions and preview positions. Each block token gets a
// data-source-line attribute in the HTML output.

export function sourceLinesPlugin(): MarkdownPlugin {
  return {
    name: "sourceLines",
    transformBlock: (tokens: Token[]) => verifyLineNumbers(tokens),
  };
}

// Verifies that all tokens have valid line numbers. This is a safety
// check that catches any tokens that might have been created without
// a line number (e.g., by a plugin that creates new tokens).
function verifyLineNumbers(tokens: Token[]): Token[] {
  return tokens.map((token, index) => {
    const line = "line" in token ? (token as { line?: number }).line : undefined;
    if (line === undefined || line < 1) {
      const prevToken = index > 0 ? tokens[index - 1] : undefined;
      const prevLine = prevToken && "line" in prevToken ? (prevToken as { line: number }).line : 1;
      return { ...token, line: prevLine } as Token;
    }

    if ("children" in token && Array.isArray(token.children) && token.type !== "heading" && token.type !== "paragraph") {
      return {
        ...token,
        children: verifyLineNumbers(token.children as Token[]),
      } as Token;
    }

    return token;
  });
}
