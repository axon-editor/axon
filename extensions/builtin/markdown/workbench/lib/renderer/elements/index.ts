/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, InlineToken } from "../../parser/types";
import { renderHeading, renderInline } from "./block/leaf/heading";
import { renderParagraph } from "./block/leaf/paragraph";
import { renderCodeBlock } from "./block/leaf/code";
import { renderMathBlock } from "./inline/math";
import { renderTable } from "./block/leaf/table";
import { renderList } from "./block/container/list";
import { renderBlockquote } from "./block/container/blockquote";
import { renderImage, renderVideo } from "./inline/media";
import { renderLink, renderWikiLink, renderCitation } from "./inline/link";
import { renderFootnotesSection } from "./inline/footnote";
import { renderHtmlBlock } from "./block/leaf/html";
import { renderHr } from "./block/leaf/hr";
import type { RenderContext } from "../context";

// Element renderer registry. Maps token types to their render functions.
// The main renderer calls these functions to convert tokens to HTML.

export interface ElementRenderer {
  render(token: Token, context: RenderContext, helpers: ElementHelpers): string;
}

export interface ElementHelpers {
  // Renders inline tokens to HTML.
  renderInline: (tokens: InlineToken[]) => string;

  // Renders a block token recursively.
  renderBlock: (token: Token) => string;

  // Resolves an asset path to a usable URL.
  resolveAsset: (src: string) => string;

  // Whether KaTeX math rendering is available.
  hasMath: boolean;

  // Whether Mermaid diagram rendering is available.
  hasMermaid: boolean;
}

// Renders a single block token to HTML. This is the main dispatch
// function that routes tokens to their appropriate renderers.
export function renderBlockToken(
  token: Token,
  context: RenderContext,
  helpers: ElementRenderer,
): string {
  return helpers.render(token, context, {
    renderInline: (tokens) => tokens.map(renderInline).join(""),
    renderBlock: (t) => renderBlockToken(t, context, helpers),
    resolveAsset: (src) => src,
    hasMath: true,
    hasMermaid: true,
  });
}

// Re-export all element renderers for use by the main renderer.
export {
  renderHeading,
  renderInline,
  renderParagraph,
  renderCodeBlock,
  renderMathBlock,
  renderTable,
  renderList,
  renderBlockquote,
  renderImage,
  renderVideo,
  renderLink,
  renderWikiLink,
  renderCitation,
  renderFootnotesSection,
  renderHtmlBlock,
  renderHr,
};
