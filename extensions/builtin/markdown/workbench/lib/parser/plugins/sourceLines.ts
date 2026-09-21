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
    // If the token does not have a line number, use the previous
    // token's line number or 1 as a fallback.
    if (token.line === undefined || token.line < 1) {
      return { ...token, line: index > 0 ? tokens[index - 1].line : 1 };
    }

    // Recursively verify children.
    if ("children" in token && Array.isArray(token.children)) {
      return {
        ...token,
        children: verifyLineNumbers(token.children),
      };
    }

    return token;
  });
}
