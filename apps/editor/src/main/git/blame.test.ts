/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { parseCommitMessageBatch, parseGitLinePorcelain } from "./blame";
import { resolveGitAuthorIdentity } from "./authorIdentity";

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
        authorAvatarUrl:
          resolveGitAuthorIdentity("gorden@example.com").avatarUrl,
        authorProfileUrl: "",
        authorTime: 1720000000,
        summary: "refine editor trace",
        message: "",
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
      message: "",
    });
  });
});

describe("Git commit message batch parser", () => {
  it("maps full commit message bodies to their hashes", () => {
    const first = "1234567890abcdef1234567890abcdef12345678";
    const second = "abcdef1234567890abcdef1234567890abcdef12";
    const output =
      `${first}\0Add trace popover\n\nShows the full commit message in a fixed-height modal.\0` +
      `${second}\0Fix cleanup on dispose\0`;

    expect(parseCommitMessageBatch(output)).toEqual(
      new Map([
        [first, "Add trace popover\n\nShows the full commit message in a fixed-height modal."],
        [second, "Fix cleanup on dispose"],
      ]),
    );
  });

  it("ignores malformed records", () => {
    expect(
      parseCommitMessageBatch("\0NOT-A-HASH\0body here\0\0abcdef\0stray\0"),
    ).toEqual(new Map());
  });
});
