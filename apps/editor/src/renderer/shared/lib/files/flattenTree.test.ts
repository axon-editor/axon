/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { flattenTree } from "./flattenTree";

interface TestNode {
  name: string;
  is_dir: boolean;
  children?: TestNode[];
}

const tree: TestNode = {
  name: "root",
  is_dir: true,
  children: [
    {
      name: "src",
      is_dir: true,
      children: [{ name: "index.ts", is_dir: false }],
    },
    { name: "README.md", is_dir: false },
  ],
};

describe("flattenTree", () => {
  it("returns files in depth-first order", () => {
    expect(flattenTree(tree).map((node) => node.name)).toEqual([
      "index.ts",
      "README.md",
    ]);
  });

  it("returns a file unchanged", () => {
    const file: TestNode = { name: "README.md", is_dir: false };
    expect(flattenTree(file)).toEqual([file]);
  });
});
