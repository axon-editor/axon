/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, BlockquoteToken, CalloutKind, MarkdownPlugin } from "../types";

// Callout plugin. Detects > [!KIND] syntax in blockquotes and marks
// them with a callout kind. The renderer uses this to display the
// blockquote with a specific icon and color scheme.
//
// Supported callout kinds: note, tip, important, warning, caution.
// The syntax is case-insensitive: > [!Note] and > [!note] both work.

export function calloutsPlugin(): MarkdownPlugin {
  return {
    name: "callouts",
    transformBlock: (tokens: Token[]) => processBlock(tokens),
  };
}

// Recursively processes block tokens to find blockquotes with callout
// syntax. Blockquotes can be nested, so we process children too.
function processBlock(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    if (token.type === "blockquote") {
      return processBlockquote(token);
    }

    // Recurse into list items and footnote definitions, the only
    // block containers that can hold nested blockquotes.
    if (token.type === "list") {
      return {
        ...token,
        items: token.items.map((item) => ({
          ...item,
          children: processBlock(item.children),
        })),
      };
    }

    if (token.type === "footnoteDefinition") {
      return {
        ...token,
        children: processBlock(token.children),
      };
    }

    return token;
  });
}

// Processes a single blockquote. If the first line matches [!KIND],
// we mark the blockquote with that kind and strip the marker from
// the first line of each child paragraph.
function processBlockquote(token: BlockquoteToken): BlockquoteToken {
  // If it already has a callout (from the tokenizer), leave it alone.
  if (token.callout) return token;

  // Check the first child for the callout marker.
  const firstChild = token.children[0];
  if (!firstChild || firstChild.type !== "paragraph") return token;

  const firstLine = extractFirstLine(firstChild);
  if (!firstLine) return token;

  const match = /^\[!(note|tip|important|warning|caution)\]/i.exec(firstLine);
  if (!match) return token;

  const kind = match[1].toLowerCase() as CalloutKind;

  // Strip the [!KIND] marker from the first line and update the
  // paragraph's inline tokens.
  const restOfLine = firstLine.slice(match[0].length).trimStart();
  const newChildren = token.children.map((child, idx) => {
    if (idx === 0 && child.type === "paragraph") {
      return {
        ...child,
        children: replaceFirstLine(child.children, restOfLine),
      };
    }
    return child;
  });

  return {
    ...token,
    callout: kind,
    children: newChildren,
  };
}

// Extracts the first line of text from an array of inline tokens.
function extractFirstLine(
  token: import("../types").ParagraphToken,
): string | null {
  let text = "";
  for (const child of token.children) {
    if (child.type === "text") {
      text += child.content;
    } else if (child.type === "softBreak") {
      break;
    } else {
      break;
    }
  }
  return text || null;
}

// Replaces the first line of text in inline tokens with new content.
function replaceFirstLine(
  children: import("../types").InlineToken[],
  newFirstLine: string,
): import("../types").InlineToken[] {
  const result: import("../types").InlineToken[] = [];
  let replaced = false;

  for (const child of children) {
    if (!replaced && child.type === "text") {
      // Replace the text content but keep any trailing content
      // after the first newline.
      const newlineIdx = child.content.indexOf("\n");
      if (newlineIdx !== -1) {
        result.push({
          type: "text",
          content: newFirstLine + child.content.slice(newlineIdx),
        });
      } else {
        result.push({ type: "text", content: newFirstLine });
      }
      replaced = true;
    } else {
      result.push(child);
    }
  }

  // If we did not find any text tokens, add the new first line.
  if (!replaced && newFirstLine) {
    result.unshift({ type: "text", content: newFirstLine });
  }

  return result;
}
