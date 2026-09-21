/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownPlugin, ParseOptions } from "../types";
import { frontmatterPlugin } from "./frontmatter";
import { gfmPlugin } from "./gfm";
import { mathPlugin } from "./math";
import { calloutsPlugin } from "./callouts";
import { wikiLinksPlugin } from "./wikiLinks";
import { sourceLinesPlugin } from "./sourceLines";

// Plugin registry. Creates the ordered list of plugins based on the
// parser options. Plugin order matters: some transformations depend
// on others running first (e.g., callouts must run before general
// blockquote processing).

export function createPlugins(options: ParseOptions): MarkdownPlugin[] {
  const plugins: MarkdownPlugin[] = [];

  // Frontmatter is always first. It extracts and removes the YAML
  // block before any other plugin sees it.
  if (options.frontmatter !== false) {
    plugins.push(frontmatterPlugin());
  }

  // Callouts must run before wiki links because callout syntax
  // [!KIND] looks similar to wiki link syntax [[target]].
  if (options.callouts !== false) {
    plugins.push(calloutsPlugin());
  }

  // Wiki links and citations are inline transforms.
  if (options.wikiLinks !== false) {
    plugins.push(wikiLinksPlugin());
  }

  // GFM (strikethrough) is an inline transform.
  if (options.gfm !== false) {
    plugins.push(gfmPlugin());
  }

  // Math is an inline transform.
  if (options.math !== false) {
    plugins.push(mathPlugin());
  }

  // Source lines is always last. It verifies line numbers after all
  // other plugins have run.
  if (options.sourceLines !== false) {
    plugins.push(sourceLinesPlugin());
  }

  return plugins;
}
