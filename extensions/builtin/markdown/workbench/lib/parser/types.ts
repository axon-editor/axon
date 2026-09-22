/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Callout kinds. Callouts are blockquotes prefixed with [!KIND] and map
// to specific visual styles in the renderer.
export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

// Inline tokens represent text-level formatting within a block. They form
// a tree structure where container tokens hold child inline tokens.
export type InlineToken =
  | InlineText
  | InlineStrong
  | InlineEmphasis
  | InlineDelete
  | InlineCode
  | InlineLink
  | InlineImage
  | InlineFootnoteReference
  | InlineWikiLink
  | InlineCitation
  | InlineMath
  | InlineHtmlInline
  | InlineSoftBreak
  | InlineHardBreak;

interface InlineText {
  type: "text";
  content: string;
}

interface InlineStrong {
  type: "strong";
  children: InlineToken[];
}

interface InlineEmphasis {
  type: "emphasis";
  children: InlineToken[];
}

interface InlineDelete {
  type: "delete";
  children: InlineToken[];
}

interface InlineCode {
  type: "inlineCode";
  content: string;
}

interface InlineLink {
  type: "link";
  href: string;
  title?: string;
  children: InlineToken[];
}

interface InlineImage {
  type: "image";
  src: string;
  alt: string;
  title?: string;
}

interface InlineFootnoteReference {
  type: "footnoteReference";
  id: string;
}

// Wiki links use [[target]] or [[target|label]] syntax. They resolve to
// internal markdown files within the workspace.
interface InlineWikiLink {
  type: "wikiLink";
  target: string;
  label?: string;
}

// Citations use [@citation-id] syntax. They reference bibliography entries
// defined in frontmatter.
interface InlineCitation {
  type: "citation";
  id: string;
}

interface InlineMath {
  type: "math";
  content: string;
  display: boolean;
}

// Raw HTML inline elements are passed through with sanitization in the
// renderer. We preserve them because some markdown extensions use inline
// HTML for styling.
interface InlineHtmlInline {
  type: "htmlInline";
  content: string;
}

// Soft break is a single newline within a paragraph. In markdown, a single
// newline does not create a new paragraph, but we track it so the renderer
// can optionally preserve it.
interface InlineSoftBreak {
  type: "softBreak";
}

// Hard break is two trailing spaces or a backslash at the end of a line.
// It forces a line break within a paragraph.
interface InlineHardBreak {
  type: "hardBreak";
}

// Block tokens represent the top-level structure of the document. Each block
// has a line number for scroll sync mapping.
export type Token =
  | HeadingToken
  | ParagraphToken
  | CodeToken
  | MathBlockToken
  | ListToken
  | BlockquoteToken
  | TableToken
  | ThematicBreakToken
  | FrontmatterToken
  | FootnoteDefinitionToken
  | HtmlBlockToken;

export interface HeadingToken {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineToken[];
  id: string;
  line: number;
}

export interface ParagraphToken {
  type: "paragraph";
  children: InlineToken[];
  line: number;
}

export interface CodeToken {
  type: "code";
  language: string;
  content: string;
  line: number;
}

export interface MathBlockToken {
  type: "mathBlock";
  content: string;
  line: number;
}

export interface ListToken {
  type: "list";
  ordered: boolean;
  items: ListItemToken[];
  line: number;
}

export interface ListItemToken {
  type: "listItem";
  children: Token[];
  checked: boolean | null;
  line: number;
}

export interface BlockquoteToken {
  type: "blockquote";
  children: Token[];
  callout?: CalloutKind;
  line: number;
}

export interface TableToken {
  type: "table";
  headers: InlineToken[][];
  rows: InlineToken[][][];
  align: ("left" | "center" | "right" | null)[];
  line: number;
}

export interface ThematicBreakToken {
  type: "thematicBreak";
  line: number;
}

export interface FrontmatterToken {
  type: "frontmatter";
  data: Record<string, unknown>;
}

export interface FootnoteDefinitionToken {
  type: "footnoteDefinition";
  id: string;
  children: Token[];
  line: number;
}

export interface HtmlBlockToken {
  type: "htmlBlock";
  content: string;
  line: number;
}

// Options passed to the parser. Plugins read from this to determine which
// extensions to enable.
export interface ParseOptions {
  gfm?: boolean;
  math?: boolean;
  frontmatter?: boolean;
  callouts?: boolean;
  wikiLinks?: boolean;
  sourceLines?: boolean;
}

// Plugins extend the tokenizer with custom syntax. Each plugin can
// transform inline tokens after inline parsing, or transform block
// tokens after block parsing. Order matters for some syntax.
export interface MarkdownPlugin {
  name: string;
  transformInline?: (tokens: InlineToken[]) => InlineToken[];
  transformBlock?: (tokens: Token[]) => Token[];
}
