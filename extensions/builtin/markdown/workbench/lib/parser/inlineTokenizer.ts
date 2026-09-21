/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken } from "./types";

// Parses inline markdown text into a tree of InlineTokens. This handles
// bold, italic, strikethrough, code, links, images, math, and HTML.
// The parser uses a character-by-character scan with a stack-based approach
// for nested formatting.

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Inline code takes priority because backticks prevent interpretation
    // of other formatting markers inside the code span.
    if (text[pos] === "`") {
      const code = parseInlineCode(text, pos);
      if (code) {
        tokens.push(code.token);
        pos = code.end;
        continue;
      }
    }

    // Images must be checked before links because ![...](...) starts
    // with the same characters as [...](...) but with a leading !.
    if (text[pos] === "!" && text[pos + 1] === "[") {
      const image = parseImage(text, pos);
      if (image) {
        tokens.push(image.token);
        pos = image.end;
        continue;
      }
    }

    // Links use [...](...) syntax.
    if (text[pos] === "[" ) {
      const link = parseLink(text, pos);
      if (link) {
        tokens.push(link.token);
        pos = link.end;
        continue;
      }
    }

    // Math expressions use $...$ for inline and $$...$$ for display.
    // Display math is handled at the block level, so we only catch
    // single-dollar inline math here.
    if (text[pos] === "$") {
      const math = parseInlineMath(text, pos);
      if (math) {
        tokens.push(math.token);
        pos = math.end;
        continue;
      }
    }

    // Wiki links use [[target]] or [[target|label]] syntax.
    if (text[pos] === "[" && text[pos + 1] === "[") {
      const wiki = parseWikiLink(text, pos);
      if (wiki) {
        tokens.push(wiki.token);
        pos = wiki.end;
        continue;
      }
    }

    // Citations use [@id] syntax.
    if (text[pos] === "[" && text[pos + 1] === "@") {
      const citation = parseCitation(text, pos);
      if (citation) {
        tokens.push(citation.token);
        pos = citation.end;
        continue;
      }
    }

    // Footnote references use [^id] syntax.
    if (text[pos] === "[" && text[pos + 1] === "^") {
      const footnote = parseFootnoteRef(text, pos);
      if (footnote) {
        tokens.push(footnote.token);
        pos = footnote.end;
        continue;
      }
    }

    // HTML tags are passed through for sanitization in the renderer.
    if (text[pos] === "<") {
      const html = parseHtmlInline(text, pos);
      if (html) {
        tokens.push(html.token);
        pos = html.end;
        continue;
      }
    }

    // Hard break is two trailing spaces followed by a newline, or a
    // backslash followed by a newline.
    if (text[pos] === "\\" && text[pos + 1] === "\n") {
      tokens.push({ type: "hardBreak" });
      pos += 2;
      continue;
    }

    if (
      text[pos] === " " &&
      text[pos + 1] === " " &&
      text[pos + 2] === "\n"
    ) {
      tokens.push({ type: "hardBreak" });
      pos += 3;
      continue;
    }

    // Soft break is a newline that is not a hard break.
    if (text[pos] === "\n") {
      tokens.push({ type: "softBreak" });
      pos++;
      continue;
    }

    // Collect plain text until the next special character.
    const textEnd = findNextSpecial(text, pos);
    if (textEnd > pos) {
      tokens.push({ type: "text", content: text.slice(pos, textEnd) });
      pos = textEnd;
      continue;
    }

    // If we could not parse anything, advance by one character to
    // avoid an infinite loop. This should not happen in valid markdown.
    tokens.push({ type: "text", content: text[pos] });
    pos++;
  }

  // Flatten consecutive text tokens that are adjacent. This happens
  // when a special character splits what would otherwise be one text
  // run.
  return flattenTextTokens(tokens);
}

// Scans forward from pos to find the next character that could start
// an inline construct. Returns the position of that character.
function findNextSpecial(text: string, pos: number): number {
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (
      ch === "`" ||
      ch === "[" ||
      ch === "!" ||
      ch === "$" ||
      ch === "<" ||
      ch === "\\" ||
      ch === "\n"
    ) {
      return i;
    }
    // Two asterisks or two underscores start bold. One starts emphasis.
    // We check for the opening marker here to stop text collection.
    if (ch === "*" || ch === "_") {
      return i;
    }
    // Tilde is strikethrough with ~~.
    if (ch === "~") {
      return i;
    }
  }
  return text.length;
}

// Parses an inline code span starting at the backtick. Returns the token
// and the position after the closing backtick, or null if there is no
// closing backtick on the same line.
function parseInlineCode(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  // Count consecutive opening backticks to match the closing sequence.
  let openingLength = 0;
  while (text[pos + openingLength] === "`") {
    openingLength++;
  }
  const start = pos + openingLength;

  // Search for a closing sequence of the same length.
  for (let i = start; i <= text.length - openingLength; i++) {
    if (text.slice(i, i + openingLength).split("").every((c) => c === "`")) {
      const content = text.slice(start, i);
      // Trim one newline from the start and end if present. This is
      // per the CommonMark spec: a code span can start and end with
      // a newline that gets stripped.
      const trimmed = content.replace(/^\n/, "").replace(/\n$/, "");
      return {
        token: { type: "inlineCode", content: trimmed },
        end: i + openingLength,
      };
    }
  }

  return null;
}

// Parses an image ![alt](src "title") starting at the ! character.
function parseImage(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  // Skip the ! and [.
  const altStart = pos + 2;
  const altEnd = findClosingBracket(text, altStart);
  if (altEnd === -1) return null;

  // After the closing ], expect (.
  if (text[altEnd + 1] !== "(") return null;

  // Parse the URL and optional title inside the parentheses.
  const linkResult = parseLinkDestination(text, altEnd + 2);
  if (!linkResult) return null;

  const alt = text.slice(altStart, altEnd);
  return {
    token: {
      type: "image",
      src: linkResult.href,
      alt,
      title: linkResult.title,
    },
    end: linkResult.end,
  };
}

// Parses a link [text](href "title") starting at the [ character.
function parseLink(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  const textStart = pos + 1;
  const textEnd = findClosingBracket(text, textStart);
  if (textEnd === -1) return null;

  // After the closing ], expect (.
  if (text[textEnd + 1] !== "(") return null;

  const linkResult = parseLinkDestination(text, textEnd + 2);
  if (!linkResult) return null;

  const children = parseInline(text.slice(textStart, textEnd));
  return {
    token: {
      type: "link",
      href: linkResult.href,
      title: linkResult.title,
      children,
    },
    end: linkResult.end,
  };
}

// Finds the position of the closing ] bracket, respecting nested brackets.
// Returns -1 if not found.
function findClosingBracket(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") {
      if (depth === 0) return i;
      depth--;
    }
    // Backslash escapes the next character inside links.
    if (text[i] === "\\") i++;
  }
  return -1;
}

// Parses a link destination and optional title from (href "title") syntax.
// Returns the href, title, and position after the closing paren.
function parseLinkDestination(
  text: string,
  pos: number,
): { href: string; title: string | undefined; end: number } | null {
  // Skip whitespace after (.
  while (text[pos] === " ") pos++;

  if (pos >= text.length || text[pos] !== "<" && text[pos] === ")") {
    return null;
  }

  let href: string;
  let title: string | undefined;

  if (text[pos] === "<") {
    // Angle bracket URL: <href>
    const closeAngle = text.indexOf(">", pos);
    if (closeAngle === -1) return null;
    href = text.slice(pos + 1, closeAngle);
    pos = closeAngle + 1;
  } else {
    // Bare URL: read until whitespace or ).
    const urlStart = pos;
    while (pos < text.length && text[pos] !== " " && text[pos] !== ")") {
      if (text[pos] === "\\") pos++;
      pos++;
    }
    href = text.slice(urlStart, pos);
  }

  // Skip whitespace before optional title.
  while (text[pos] === " ") pos++;

  // Optional title in quotes, apostrophes, or parentheses.
  if (text[pos] === '"' || text[pos] === "'") {
    const quote = text[pos];
    pos++;
    const titleStart = pos;
    while (pos < text.length && text[pos] !== quote) {
      if (text[pos] === "\\") pos++;
      pos++;
    }
    title = text.slice(titleStart, pos);
    pos++; // skip closing quote
  } else if (text[pos] === "(") {
    // Parenthesized title.
    pos++;
    const titleStart = pos;
    while (pos < text.length && text[pos] !== ")") {
      if (text[pos] === "\\") pos++;
      pos++;
    }
    title = text.slice(titleStart, pos);
    pos++; // skip closing paren
  }

  // Skip whitespace before ).
  while (text[pos] === " ") pos++;

  if (text[pos] !== ")") return null;
  pos++; // skip )

  return { href, title, end: pos };
}

// Parses an inline math expression $...$. Returns null if there is no
// closing $ on the same line.
function parseInlineMath(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  const start = pos + 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "$" && text[i - 1] !== "\\") {
      return {
        token: {
          type: "math",
          content: text.slice(start, i),
          display: false,
        },
        end: i + 1,
      };
    }
  }
  return null;
}

// Parses a wiki link [[target]] or [[target|label]].
function parseWikiLink(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  const start = pos + 2;
  const end = text.indexOf("]]", start);
  if (end === -1) return null;

  const inner = text.slice(start, end);
  const pipeIndex = inner.indexOf("|");

  if (pipeIndex === -1) {
    return {
      token: { type: "wikiLink", target: inner.trim() },
      end: end + 2,
    };
  }

  return {
    token: {
      type: "wikiLink",
      target: inner.slice(0, pipeIndex).trim(),
      label: inner.slice(pipeIndex + 1).trim(),
    },
    end: end + 2,
  };
}

// Parses a citation [@id].
function parseCitation(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  const start = pos + 2;
  const end = text.indexOf("]", start);
  if (end === -1) return null;

  return {
    token: { type: "citation", id: text.slice(start, end) },
    end: end + 1,
  };
}

// Parses a footnote reference [^id].
function parseFootnoteRef(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  const start = pos + 2;
  const end = text.indexOf("]", start);
  if (end === -1) return null;

  return {
    token: { type: "footnoteReference", id: text.slice(start, end) },
    end: end + 1,
  };
}

// Parses an inline HTML tag. We match opening tags like <div> and
// closing tags like </div>. Self-closing tags like <br/> are also
// handled. We do not validate the tag name here; sanitization happens
// in the renderer.
function parseHtmlInline(
  text: string,
  pos: number,
): { token: InlineToken; end: number } | null {
  if (text[pos + 1] === "/") {
    // Closing tag: </tagname>
    const closeEnd = text.indexOf(">", pos);
    if (closeEnd === -1) return null;
    return {
      token: {
        type: "htmlInline",
        content: text.slice(pos, closeEnd + 1),
      },
      end: closeEnd + 1,
    };
  }

  // Opening tag or self-closing: <tagname ... />
  const tagEnd = text.indexOf(">", pos);
  if (tagEnd === -1) return null;

  // Make sure it is not a comment <!-- ... -->.
  if (text[pos + 1] === "!" && text[pos + 2] === "-" && text[pos + 3] === "-") {
    const commentEnd = text.indexOf("-->", pos);
    if (commentEnd === -1) return null;
    return {
      token: {
        type: "htmlInline",
        content: text.slice(pos, commentEnd + 3),
      },
      end: commentEnd + 3,
    };
  }

  return {
    token: {
      type: "htmlInline",
      content: text.slice(pos, tagEnd + 1),
    },
    end: tagEnd + 1,
  };
}

// Merges adjacent text tokens into single tokens. This cleans up the
// output after parsing splits text at special characters.
function flattenTextTokens(tokens: InlineToken[]): InlineToken[] {
  const result: InlineToken[] = [];

  for (const token of tokens) {
    const last = result[result.length - 1];
    if (token.type === "text" && last?.type === "text") {
      last.content += token.content;
    } else {
      result.push(token);
    }
  }

  return result;
}
