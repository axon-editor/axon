/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ThematicBreakToken } from "../types";

// Horizontal rule renderer. Converts thematic break tokens to HTML.

export function renderHr(token: ThematicBreakToken): string {
  return `<hr data-source-line="${token.line}" class="my-8 border-[var(--axon-panel-border)]" />`;
}
