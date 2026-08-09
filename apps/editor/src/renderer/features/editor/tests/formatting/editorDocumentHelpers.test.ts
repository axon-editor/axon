import { describe, expect, it } from "vitest";
import { isMarkdownFile } from "@axon-builtin-markdown/lib/markdownPreviewTabs";

describe("editor document helpers", () => {
  it.each([
    "/workspace/README.md",
    "/workspace/guide.mdx",
    "/workspace/notes.markdown",
    "/workspace/GUIDE.MDX",
  ])("enables Markdown preview for %s", (filePath) => {
    expect(isMarkdownFile(filePath)).toBe(true);
  });

  it("does not enable Markdown preview for similarly named source files", () => {
    expect(isMarkdownFile("/workspace/markdown.ts")).toBe(false);
    expect(isMarkdownFile("/workspace/guide.mdx.tsx")).toBe(false);
  });
});
