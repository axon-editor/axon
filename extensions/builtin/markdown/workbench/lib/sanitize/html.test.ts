/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./html";

describe("sanitizeHtml", () => {
  it("keeps safe markup", () => {
    const result = sanitizeHtml("<strong>safe</strong>");
    expect(result).toContain("<strong>safe</strong>");
  });

  it("removes scripts and embedded documents", () => {
    const result = sanitizeHtml(
      '<script>alert(1)</script><iframe src="https://example.com"></iframe><style>body{}</style>',
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("<style");
  });

  it("removes event handlers and javascript urls", () => {
    const result = sanitizeHtml(
      '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a>',
    );
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("javascript:");
  });

  it("removes forms and form controls", () => {
    const result = sanitizeHtml('<form><input value="x"><button>go</button></form>');
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
    expect(result).not.toContain("<button");
  });

  it("keeps ordinary links", () => {
    const result = sanitizeHtml('<a href="https://example.com">site</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it("drops inline styles and data attributes from raw html", () => {
    const result = sanitizeHtml('<div style="color:red" data-source-line="4">x</div>');
    expect(result).not.toContain("style=");
    expect(result).not.toContain("data-source-line");
    expect(result).toContain("x");
  });
});
