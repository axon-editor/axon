import { describe, expect, it } from "vitest";
import { computeGitLineDecorations } from "./gitLineDecorations";

describe("live Git line decorations", () => {
  it("marks lines added to a new file", () => {
    expect(
      computeGitLineDecorations("", "const first = 1;\nconst second = 2;"),
    ).toEqual([
      { lineNumber: 1, kind: "added" },
      { lineNumber: 2, kind: "added" },
    ]);
  });

  it("recomputes replacement lines after deleting and re-adding a block", () => {
    const base = "function run() {\n  return 1;\n}";
    const replacement = "function run() {\n  const value = 2;\n  return value;\n}";

    expect(computeGitLineDecorations(base, "function run() {\n}")).toEqual([
      { lineNumber: 2, kind: "deleted" },
    ]);
    expect(computeGitLineDecorations(base, replacement)).toEqual([
      { lineNumber: 2, kind: "modified" },
      { lineNumber: 3, kind: "modified" },
    ]);
  });

  it("distinguishes insertions from replacements", () => {
    expect(
      computeGitLineDecorations("one\nthree", "one\ntwo\nthree"),
    ).toEqual([{ lineNumber: 2, kind: "added" }]);
    expect(computeGitLineDecorations("one\ntwo", "one\nchanged")).toEqual([
      { lineNumber: 2, kind: "modified" },
    ]);
  });

  it("anchors deleted lines to the surviving model", () => {
    expect(computeGitLineDecorations("one\ntwo\nthree", "one\nthree")).toEqual([
      { lineNumber: 2, kind: "deleted" },
    ]);
  });

  it("returns no paint after content returns to the Git base", () => {
    const content = "const value = 1;\n";
    expect(computeGitLineDecorations(content, content)).toEqual([]);
  });
});
