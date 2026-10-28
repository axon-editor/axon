/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { describe, expect, it } from "vitest";
import { resolveAgentWritePath } from "./agentToolPaths";

describe("resolveAgentWritePath", () => {
  it("resolves a workspace-relative path against the folder", () => {
    expect(resolveAgentWritePath("/workspace", "src/new.ts")).toBe(
      path.resolve("/workspace", "src/new.ts"),
    );
  });

  it("keeps an absolute path without nesting it under the folder", () => {
    expect(resolveAgentWritePath("/workspace", "/workspace/src/new.ts")).toBe(
      path.resolve("/workspace/src/new.ts"),
    );
  });

  it("rejects tab URIs and empty paths", () => {
    expect(() => resolveAgentWritePath("/workspace", "axon://problems")).toThrow(
      "filesystem path",
    );
    expect(() => resolveAgentWritePath("/workspace", "   ")).toThrow(
      "No file path",
    );
  });
});
