/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
  Token,
  ParagraphToken,
  ListToken,
  ListItemToken,
  BlockquoteToken,
  TableToken,
  MathBlockToken,
  HtmlBlockToken,
  FootnoteDefinitionToken,
  InlineToken,
  ParseOptions,
} from "./types";
import { parseInline } from "./inlineTokenizer";

// Block-level tokenizer. Converts markdown text into an array of block
// tokens. The tokenizer processes lines sequentially, maintaining state
// to handle multi-line constructs like code fences, lists, and blockquotes.

interface TokenizeState {
  // Current line number (1-indexed for scroll sync).
  line: number;
  // Whether we are inside a code fence.
  inCodeFence: boolean;
  // The fence string that opened the current code fence (e.g., "```").
  codeFence: string;
  // Accumulated lines for the current code block.
  codeLines: string[];
  // The line number where the current code fence started.
  codeStartLine: number;
  // The language identifier from the opening fence.
  codeLanguage: string;
}

export function tokenizeBlocks(
  content: string,
  options: ParseOptions = {},
): Token[] {
  const lines = content.split("\n");
  const tokens: Token[] = [];
  const state: TokenizeState = {
    line: 1,
    inCodeFence: false,
    codeFence: "",
    codeLines: [],
    codeStartLine: 0,
    codeLanguage: "",
  };

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Inside a code fence, everything is raw text until the closing fence.
    if (state.inCodeFence) {
      if (isClosingCodeFence(line, state.codeFence)) {
        tokens.push({
          type: "code",
          language: state.codeLanguage,
          content: state.codeLines.join("\n"),
          line: state.codeStartLine,
        });
        state.inCodeFence = false;
        state.codeLines = [];
      } else {
        state.codeLines.push(line);
      }
      i++;
      state.line++;
      continue;
    }

    // Opening code fence: ```language or ~~~language.
    const fenceMatch = /^(#{3,}|~{3,})(\s*)(\S*)/.exec(line);
    if (fenceMatch) {
      state.inCodeFence = true;
      state.codeFence = fenceMatch[1];
      state.codeLanguage = fenceMatch[3] || "";
      state.codeStartLine = state.line;
      state.codeLines = [];
      i++;
      state.line++;
      continue;
    }

    // Empty lines separate blocks. We skip them and let the next
    // non-empty line start a new block.
    if (line.trim() === "") {
      i++;
      state.line++;
      continue;
    }

    // Thematic break: three or more hyphens, asterisks, or underscores
    // on a line by themselves (possibly with spaces).
    if (isThematicBreak(line)) {
      tokens.push({ type: "thematicBreak", line: state.line });
      i++;
      state.line++;
      continue;
    }

    // Heading: # through ###### followed by a space or end of line.
    const headingMatch = /^(#{1,6})\s+(.*)/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2];
      tokens.push({
        type: "heading",
        level,
        children: parseInline(text),
        id: "",
        line: state.line,
      });
      i++;
      state.line++;
      continue;
    }

    // ATX heading without trailing space: ###heading
    const atxMatch = /^(#{1,6})$/.exec(line);
    if (atxMatch) {
      tokens.push({
        type: "heading",
        level: atxMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: [],
        id: "",
        line: state.line,
      });
      i++;
      state.line++;
      continue;
    }

    // Fenced math block: $$...$$
    if (options.math && line.trim().startsWith("$$")) {
      const mathResult = parseMathBlock(lines, i, state.line);
      if (mathResult) {
        tokens.push(mathResult.token);
        i = mathResult.endLine;
        state.line = mathResult.endLine;
        continue;
      }
    }

    // HTML block: starts with a block-level HTML tag.
    const htmlResult = parseHtmlBlock(lines, i, state.line);
    if (htmlResult) {
      tokens.push(htmlResult.token);
      i = htmlResult.endLine;
      state.line = htmlResult.endLine;
      continue;
    }

    // Blockquote: starts with >.
    if (line.startsWith(">")) {
      const bqResult = parseBlockquote(lines, i, state.line, options);
      tokens.push(bqResult.token);
      i = bqResult.endLine;
      state.line = bqResult.endLine;
      continue;
    }

    // Unordered list: starts with -, *, or + followed by a space.
    const ulMatch = /^(\s*)([-*+])\s+/.exec(line);
    if (ulMatch) {
      const listResult = parseList(lines, i, state.line, false, options);
      tokens.push(listResult.token);
      i = listResult.endLine;
      state.line = listResult.endLine;
      continue;
    }

    // Ordered list: starts with a number followed by . and a space.
    const olMatch = /^(\s*)(\d+)\.\s+/.exec(line);
    if (olMatch) {
      const listResult = parseList(lines, i, state.line, true, options);
      tokens.push(listResult.token);
      i = listResult.endLine;
      state.line = listResult.endLine;
      continue;
    }

    // Table: starts with a row of pipes and hyphens.
    if (options.gfm && isTableRow(line)) {
      const tableResult = parseTable(lines, i, state.line);
      if (tableResult) {
        tokens.push(tableResult.token);
        i = tableResult.endLine;
        state.line = tableResult.endLine;
        continue;
      }
    }

    // Footnote definition: [^id]: followed by content.
    const fnMatch = /^\[\^(\w+)\]:\s*(.*)/.exec(line);
    if (fnMatch) {
      const fnResult = parseFootnoteDefinition(
        lines,
        i,
        state.line,
        fnMatch[1],
        fnMatch[2],
      );
      tokens.push(fnResult.token);
      i = fnResult.endLine;
      state.line = fnResult.endLine;
      continue;
    }

    // Default: paragraph. Collect lines until we hit a blank line or
    // a block-level construct.
    const paraResult = parseParagraph(lines, i, state.line);
    tokens.push(paraResult.token);
    i = paraResult.endLine;
    state.line = paraResult.endLine;
  }

  // If we ended inside a code fence without a closing fence, push
  // the accumulated content as a code block. This is permissive
  // parsing for incomplete documents.
  if (state.inCodeFence && state.codeLines.length > 0) {
    tokens.push({
      type: "code",
      language: state.codeLanguage,
      content: state.codeLines.join("\n"),
      line: state.codeStartLine,
    });
  }

  return tokens;
}

// Checks if a line is a closing code fence matching the opening fence.
function isClosingCodeFence(line: string, fence: string): boolean {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;

  // Closing fence must have at least as many fence characters as the
  // opening, and no content after it except spaces.
  if (indent > 3) return false;

  const fenceChar = fence[0];
  const fenceLen = fence.length;
  let count = 0;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === fenceChar) {
      count++;
    } else {
      break;
    }
  }

  return count >= fenceLen && trimmed.slice(count).trim() === "";
}

// Checks if a line is a thematic break (hr).
function isThematicBreak(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;

  const char = trimmed[0];
  if (char !== "-" && char !== "*" && char !== "_") return false;

  let count = 0;
  for (const ch of trimmed) {
    if (ch === char) {
      count++;
    } else if (ch === " ") {
      // Spaces are allowed between fence characters.
    } else {
      return false;
    }
  }

  return count >= 3;
}

// Checks if a line looks like a table row (contains at least one pipe).
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") || trimmed.includes("|");
}

// Parses a paragraph starting at the given line index. Returns the
// paragraph token and the index of the next line to process.
function parseParagraph(
  lines: string[],
  startLine: number,
  lineNum: number,
): { token: ParagraphToken; endLine: number } {
  const collected: string[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line ends the paragraph.
    if (line.trim() === "") break;

    // Block-level constructs end the paragraph.
    if (isBlockStart(line)) break;

    collected.push(line);
    i++;
  }

  // Join the collected lines and parse inline content. In standard
  // markdown, single newlines within a paragraph become spaces. We
  // preserve them as soft breaks for better rendering control.
  const text = collected.join("\n");

  return {
    token: {
      type: "paragraph",
      children: parseInline(text),
      line: lineNum,
    },
    endLine: i,
  };
}

// Checks if a line starts a new block-level construct. This is used
// to determine where a paragraph ends.
function isBlockStart(line: string): boolean {
  const trimmed = line.trimStart();

  // Empty line.
  if (trimmed === "") return true;

  // Heading.
  if (/^#{1,6}\s/.test(trimmed)) return true;

  // Code fence.
  if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) return true;

  // Thematic break.
  if (isThematicBreak(trimmed)) return true;

  // Blockquote.
  if (trimmed.startsWith(">")) return true;

  // List item.
  if (/^[-*+]\s/.test(trimmed)) return true;
  if (/^\d+\.\s/.test(trimmed)) return true;

  // HTML block.
  if (/^<(div|p|ul|ol|li|h[1-6]|table|thead|tbody|tr|td|th|pre|hr|br|img|blockquote|dl|dd|dt|figure|figcaption|section|article|aside|nav|header|footer|main|details|summary)[\s>/]/i.test(trimmed)) return true;

  // Footnote definition.
  if (/^\[\^\w+\]:/.test(trimmed)) return true;

  return false;
}

// Parses a blockquote starting at the given line. Returns the token
// and the index of the next line to process.
function parseBlockquote(
  lines: string[],
  startLine: number,
  lineNum: number,
  options: ParseOptions,
): { token: BlockquoteToken; endLine: number } {
  const innerLines: string[] = [];
  let i = startLine;

  // Collect all lines that belong to this blockquote. A blockquote
  // continues as long as lines start with > or are empty lines
  // between quoted lines.
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      // Empty line might be between blockquote paragraphs. We include
      // it and check if the next line continues the blockquote.
      if (i + 1 < lines.length && lines[i + 1].startsWith(">")) {
        innerLines.push("");
        i++;
        continue;
      }
      break;
    }

    if (line.startsWith(">")) {
      // Strip the > prefix and optional space.
      innerLines.push(line.slice(1).replace(/^\s?/, ""));
      i++;
      continue;
    }

    // Lazy continuation: a non-empty line that does not start with >
    // can continue a blockquote if the previous line was quoted.
    if (innerLines.length > 0 && line.trim() !== "") {
      innerLines.push(line);
      i++;
      continue;
    }

    break;
  }

  // Parse the inner content as markdown.
  const innerContent = innerLines.join("\n");
  const children = tokenizeBlocks(innerContent, options);

  // Check for callout syntax: > [!NOTE], > [!WARNING], etc.
  let callout: import("./types").CalloutKind | undefined;
  if (options.callouts && innerLines.length > 0) {
    const firstLine = innerLines[0].trim();
    const calloutMatch = /^\[!(note|tip|important|warning|caution)\]/i.exec(
      firstLine,
    );
    if (calloutMatch) {
      callout = calloutMatch[1].toLowerCase() as import("./types").CalloutKind;
    }
  }

  return {
    token: {
      type: "blockquote",
      children,
      callout,
      line: lineNum,
    },
    endLine: i,
  };
}

// Parses a list starting at the given line. Returns the token and
// the index of the next line to process.
function parseList(
  lines: string[],
  startLine: number,
  lineNum: number,
  ordered: boolean,
  options: ParseOptions,
): { token: ListToken; endLine: number } {
  const items: ListItemToken[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line between list items is allowed.
    if (line.trim() === "") {
      // If the next line is a list item, continue. Otherwise, end.
      if (i + 1 < lines.length && isListItem(lines[i + 1], ordered)) {
        i++;
        continue;
      }
      break;
    }

    // Check if this line is a list item.
    if (!isListItem(line, ordered)) {
      // Lazy continuation: a non-list line can continue a list item
      // if we have items and the previous line was part of an item.
      if (items.length > 0) {
        // Append to the last item's content.
        const lastItem = items[items.length - 1];
        lastItem.children = tokenizeBlocks(
          getListItemText(lastItem) + "\n" + line,
          options,
        );
        i++;
        continue;
      }
      break;
    }

    // Parse the list item.
    const itemResult = parseListItem(lines, i, ordered, options);
    items.push(itemResult.item);
    i = itemResult.endLine;
  }

  return {
    token: {
      type: "list",
      ordered,
      items,
      line: lineNum,
    },
    endLine: i,
  };
}

// Checks if a line is a list item.
function isListItem(line: string, ordered: boolean): boolean {
  if (ordered) {
    return /^\s*\d+\.\s/.test(line);
  }
  return /^\s*[-*+]\s/.test(line);
}

// Extracts the raw text content of a list item for lazy continuation.
function getListItemText(item: ListItemToken): string {
  return item.children
    .map((child) => {
      if (child.type === "paragraph") {
        return child.children
          .map((c) => (c.type === "text" ? c.content : ""))
          .join("");
      }
      return "";
    })
    .join("\n");
}

// Parses a single list item starting at the given line.
function parseListItem(
  lines: string[],
  startLine: number,
  ordered: boolean,
  options: ParseOptions,
): { item: ListItemToken; endLine: number } {
  const line = lines[startLine];
  let contentStart: number;
  let checked: boolean | null = null;

  if (ordered) {
    const match = /^\s*\d+\.\s+/.exec(line);
    contentStart = match ? match[0].length : 0;
  } else {
    const match = /^\s*[-*+]\s+/.exec(line);
    contentStart = match ? match[0].length : 0;

    // Check for task list checkbox: [ ] or [x].
    const checkboxMatch = /^\[([ xX])\]\s/.exec(line.slice(contentStart));
    if (checkboxMatch) {
      checked = checkboxMatch[1].toLowerCase() === "x";
      contentStart += checkboxMatch[0].length;
    }
  }

  const collected: string[] = [line.slice(contentStart)];
  let i = startLine + 1;

  // Collect continuation lines (indented or blank lines between items).
  while (i < lines.length) {
    const nextLine = lines[i];

    if (nextLine.trim() === "") {
      if (i + 1 < lines.length && isListItem(lines[i + 1], ordered)) {
        break;
      }
      // Blank line within the item content.
      collected.push("");
      i++;
      continue;
    }

    // Indented content continues the list item.
    const indent = nextLine.length - nextLine.trimStart().length;
    if (indent >= contentStart) {
      collected.push(nextLine.slice(contentStart));
      i++;
      continue;
    }

    // Non-indented, non-list content ends the item.
    break;
  }

  const content = collected.join("\n");
  const children = tokenizeBlocks(content, options);

  return {
    item: {
      type: "listItem",
      children,
      checked,
      line: startLine,
    },
    endLine: i,
  };
}

// Parses a table starting at the given line. Returns the token and
// the index of the next line to process.
function parseTable(
  lines: string[],
  startLine: number,
  lineNum: number,
): { token: TableToken; endLine: number } | null {
  // A table requires at least a header row and a separator row.
  if (startLine + 1 >= lines.length) return null;

  const headerLine = lines[startLine].trim();
  const separatorLine = lines[startLine + 1].trim();

  // The separator row must contain hyphens and pipes.
  if (!/^\|?[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|?$/.test(separatorLine)) {
    return null;
  }

  const headers = parseTableRow(headerLine);
  const align = parseTableAlign(separatorLine);

  const rows: InlineToken[][] = [];
  let i = startLine + 2;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "" || !isTableRow(line)) break;

    rows.push(parseTableRow(line));
    i++;
  }

  return {
    token: {
      type: "table",
      headers: headers.map((cell) => parseInline(cell)),
      rows: rows.map((row) => row.map((cell) => parseInline(cell))),
      align,
      line: lineNum,
    },
    endLine: i,
  };
}

// Parses a single table row into an array of cell strings.
function parseTableRow(line: string): string[] {
  // Strip leading and trailing pipes.
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);

  return trimmed.split("|").map((cell) => cell.trim());
}

// Parses the alignment row to determine column alignment.
function parseTableAlign(
  line: string,
): ("left" | "center" | "right" | null)[] {
  const cells = parseTableRow(line);
  return cells.map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    const hasHyphens = trimmed.includes("-");

    if (!hasHyphens) return null;
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

// Parses a fenced math block ($$...$$).
function parseMathBlock(
  lines: string[],
  startLine: number,
  lineNum: number,
): { token: MathBlockToken; endLine: number } | null {
  const firstLine = lines[startLine].trim();

  // Opening $$ can be on its own line or have content after it.
  if (firstLine === "$$" || firstLine.endsWith("$$")) {
    const collected: string[] = [];
    let i = startLine;
    const startContent = firstLine === "$$" ? "" : firstLine.slice(0, -2);

    if (startContent) {
      collected.push(startContent);
    }
    i++;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === "$$" || line.startsWith("$$")) {
        const endContent = line === "$$" ? "" : line.slice(2);
        if (endContent) collected.push(endContent);
        return {
          token: {
            type: "mathBlock",
            content: collected.join("\n"),
            line: lineNum,
          },
          endLine: i + 1,
        };
      }
      collected.push(lines[i]);
      i++;
    }
  }

  return null;
}

// Parses an HTML block. HTML blocks start with a block-level tag and
// continue until a blank line or matching closing tag.
function parseHtmlBlock(
  lines: string[],
  startLine: number,
  lineNum: number,
): { token: HtmlBlockToken; endLine: number } | null {
  const line = lines[startLine].trim();

  // Match opening HTML tags.
  const tagMatch = /^<(div|p|ul|ol|li|h[1-6]|table|thead|tbody|tr|td|th|pre|hr|br|img|blockquote|dl|dd|dt|figure|figcaption|section|article|aside|nav|header|footer|main|details|summary)([\s>])/i.exec(line);
  if (!tagMatch) return null;

  const tagName = tagMatch[1].toLowerCase();
  const collected: string[] = [lines[startLine]];
  let i = startLine + 1;

  // Collect lines until we hit a blank line or the closing tag.
  while (i < lines.length) {
    const currentLine = lines[i];

    if (currentLine.trim() === "") break;

    // Check for closing tag.
    const closeMatch = new RegExp(`</${tagName}[\\s>]`, "i").exec(currentLine);
    if (closeMatch) {
      collected.push(currentLine);
      return {
        token: {
          type: "htmlBlock",
          content: collected.join("\n"),
          line: lineNum,
        },
        endLine: i + 1,
      };
    }

    collected.push(currentLine);
    i++;
  }

  // If we hit a blank line without a closing tag, treat the collected
  // lines as an HTML block. This is permissive for incomplete HTML.
  return {
    token: {
      type: "htmlBlock",
      content: collected.join("\n"),
      line: lineNum,
    },
    endLine: i,
  };
}

// Parses a footnote definition [^id]: content.
function parseFootnoteDefinition(
  lines: string[],
  startLine: number,
  lineNum: number,
  id: string,
  firstLineContent: string,
): { token: FootnoteDefinitionToken; endLine: number } {
  const collected: string[] = [firstLineContent];
  let i = startLine + 1;

  // Collect continuation lines that are indented.
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") break;

    const indent = line.length - line.trimStart().length;
    if (indent >= 2) {
      collected.push(line.trim());
      i++;
      continue;
    }
    break;
  }

  const content = collected.join("\n");
  const children = tokenizeBlocks(content);

  return {
    token: {
      type: "footnoteDefinition",
      id,
      children,
      line: lineNum,
    },
    endLine: i,
  };
}
