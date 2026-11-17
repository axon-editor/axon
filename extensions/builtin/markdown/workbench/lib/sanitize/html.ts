/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOMPurify from "dompurify";

// Raw HTML in markdown comes from the document being previewed, which is often
// untrusted. Regex stripping cannot follow the HTML parser's edge cases, so the
// preview uses the same DOM sanitizer everywhere instead of three slightly
// different tag/attribute blacklists.
const FORBIDDEN_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "link",
  "meta",
  "base",
];

const FORBIDDEN_ATTRIBUTES = [
  "style",
  "srcset",
  "formaction",
  "srcdoc",
  "xlink:href",
];

export function sanitizeHtml(html: string): string {
  // Renderer-only code still gets imported by tests and readme tooling. Escaping
  // is the safe fallback when DOMPurify has no window to parse against.
  if (typeof window === "undefined") {
    return escapeHtml(html);
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
