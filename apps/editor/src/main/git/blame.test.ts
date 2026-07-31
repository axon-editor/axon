import { describe, expect, it } from "vitest";
import { parseGitLinePorcelain } from "./blame";

describe("Git line porcelain parser", () => {
  it("maps committed lines and ignores uncommitted worktree lines", () => {
    const committedHash = "1234567890abcdef1234567890abcdef12345678";
    const output = [
      `${committedHash} 4 8 1`,
      "author Gorden Archer",
      "author-mail <gorden@example.com>",
      "author-time 1720000000",
      "summary refine editor trace",
      "filename src/editor.ts",
      "\tconst trace = true;",
      `${"0".repeat(40)} 5 9 1`,
      "author Not Committed Yet",
      "author-mail <not.committed.yet>",
      "author-time 1720000100",
      "summary Version of src/editor.ts from src/editor.ts",
      "filename src/editor.ts",
      "\tconst local = true;",
    ].join("\n");

    expect(parseGitLinePorcelain(output)).toEqual([
      {
        lineNumber: 8,
        hash: committedHash,
        shortHash: "12345678",
        authorName: "Gorden Archer",
        authorEmail: "gorden@example.com",
        authorTime: 1720000000,
        summary: "refine editor trace",
      },
    ]);
  });

  it("normalizes boundary commit hashes", () => {
    const hash = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const output = [
      `^${hash} 1 1 1`,
      "author Initial Author",
      "author-time 1",
      "summary initial commit",
      "filename README.md",
      "\t# project",
    ].join("\n");

    expect(parseGitLinePorcelain(output)[0]).toMatchObject({
      hash,
      shortHash: "abcdefab",
      lineNumber: 1,
    });
  });
});
