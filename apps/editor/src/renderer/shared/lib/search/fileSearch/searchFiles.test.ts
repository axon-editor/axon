/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { searchFiles } from "./searchFiles";

const files = [
  { path: "/repo/src/commandPalette.ts" },
  { path: "/repo/src/zenWorkspaceTree.ts" },
  { path: "/repo/README.md" },
];

describe("searchFiles", () => {
  it("ranks a title match first", () => {
    const results = searchFiles(files, "commandPalette", 10);
    expect(results[0]?.file.path).toBe("/repo/src/commandPalette.ts");
  });

  it("matches normalized path separators", () => {
    const results = searchFiles(files, "src/zen", 10);
    expect(results.map((entry) => entry.file.path)).toContain(
      "/repo/src/zenWorkspaceTree.ts",
    );
  });

  it("matches characters in order", () => {
    const results = searchFiles(files, "rdm", 10);
    expect(results.map((entry) => entry.file.path)).toContain(
      "/repo/README.md",
    );
  });

  it("limits the result set", () => {
    expect(searchFiles(files, "", 2)).toHaveLength(2);
  });
});
