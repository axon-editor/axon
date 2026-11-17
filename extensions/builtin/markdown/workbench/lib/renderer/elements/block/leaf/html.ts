/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { HtmlBlockToken } from "../../../../parser/types";
import { sanitizeHtml } from "../../../../sanitize/html";

// HTML block renderer. Raw tags pass through the shared DOMPurify sanitizer so
// the renderer and the preview component agree on what is safe. The wrapper is
// added after sanitizing, which keeps the source-line attribute out of the
// untrusted input path.
export function renderHtmlBlock(token: HtmlBlockToken): string {
  const sanitized = sanitizeHtml(token.content);
  return `<div data-source-line="${token.line}">${sanitized}</div>`;
}
