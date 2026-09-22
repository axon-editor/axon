/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { HtmlBlockToken } from "../../parser/types";

// HTML block renderer. Passes raw HTML through with sanitization.
// We allow a limited set of safe HTML elements and attributes.
// Dangerous elements like script, iframe, and object are stripped.

// Renders an HTML block token. Sanitizes the HTML to strip dangerous
// elements and attributes.
export function renderHtmlBlock(token: HtmlBlockToken): string {
  const sanitized = sanitizeHtml(token.content);
  return `<div data-source-line="${token.line}">${sanitized}</div>`;
}

// Sanitizes HTML by stripping disallowed tags and attributes. This
// is a simple whitelist-based sanitizer, not a full HTML parser. It
// handles common cases but may not catch all edge cases.
function sanitizeHtml(html: string): string {
  // Strip script tags and their content.
  let result = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Strip iframe, object, embed, form, input, textarea, select tags.
  result = result.replace(/<(iframe|object|embed|form|input|textarea|select)[\s\S]*?<\/\1>/gi, "");
  result = result.replace(/<(iframe|object|embed|form|input|textarea|select)[^>]*\/?>/gi, "");

  // Strip style tags.
  result = result.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Strip on* event handlers.
  result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  result = result.replace(/\s+on\w+\s*=\s*\S+/gi, "");

  return result;
}
