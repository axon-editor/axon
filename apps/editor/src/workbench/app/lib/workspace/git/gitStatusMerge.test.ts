/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { type GitStatusResult } from "../../../../../shared/workspace/git";
import { mergeGitStatusResult } from "./gitStatusMerge";

function status(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepository: true,
    root: "/workspace",
    branch: "main",
    changes: [],
    ignoredPaths: [],
    ...overrides,
  };
}

describe("mergeGitStatusResult", () => {
  it("keeps the previous changes when a rescan is degraded", () => {
    const previous = status({
      changes: [
        {
          path: "src/app.ts",
          absolutePath: "/workspace/src/app.ts",
          oldPath: null,
          indexState: "modified",
          worktreeState: "modified",
          staged: false,
          unstaged: true,
        },
      ],
      ignoredPaths: ["/workspace/dist"],
    });

    const merged = mergeGitStatusResult(
      previous,
      status({ changes: [], ignoredPaths: [], degraded: true }),
    );

    expect(merged.changes).toEqual(previous.changes);
    expect(merged.ignoredPaths).toEqual(previous.ignoredPaths);
    expect(merged.branch).toBe("main");
    expect(merged.degraded).toBe(true);
  });

  it("accepts a degraded result when no repository was painted yet", () => {
    const next = status({ changes: [], branch: "detached", degraded: true });

    expect(mergeGitStatusResult(null, next)).toBe(next);
  });

  it("does not carry changes across a different repository", () => {
    const previous = status({
      changes: [
        {
          path: "src/app.ts",
          absolutePath: "/workspace/src/app.ts",
          oldPath: null,
          indexState: "modified",
          worktreeState: "modified",
          staged: false,
          unstaged: true,
        },
      ],
    });
    const next = status({
      root: "/other",
      changes: [],
      branch: "detached",
      degraded: true,
    });

    expect(mergeGitStatusResult(previous, next)).toBe(next);
  });
});
