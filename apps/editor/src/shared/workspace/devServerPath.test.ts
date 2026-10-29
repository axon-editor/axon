/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { workspacePathFromDevServerUrl } from "./devServerPath";

describe("workspacePathFromDevServerUrl", () => {
  it("returns the workspace path from the 127.0.0.1 dev server", () => {
    expect(
      workspacePathFromDevServerUrl(
        "http://127.0.0.1:5173/packages/extension-api/README.md",
      ),
    ).toBe("/packages/extension-api/README.md");
  });

  it("returns the workspace path from the localhost dev server", () => {
    expect(
      workspacePathFromDevServerUrl(
        "http://localhost:5173/packages/extension-api/README.md#install",
      ),
    ).toBe("/packages/extension-api/README.md");
  });

  it("decodes escaped path segments", () => {
    expect(
      workspacePathFromDevServerUrl(
        "http://127.0.0.1:5173/docs/my%20notes.md",
      ),
    ).toBe("/docs/my notes.md");
  });

  it("leaves other origins and local paths alone", () => {
    expect(
      workspacePathFromDevServerUrl("https://example.com/README.md"),
    ).toBeNull();
    expect(
      workspacePathFromDevServerUrl("http://127.0.0.1:5174/README.md"),
    ).toBeNull();
    expect(workspacePathFromDevServerUrl("packages/extension-api/README.md")).toBeNull();
  });

  it("rejects traversal before the URL normalizes it", () => {
    expect(
      workspacePathFromDevServerUrl(
        "http://127.0.0.1:5173/%2e%2e/outside.md",
      ),
    ).toBeNull();
    expect(
      workspacePathFromDevServerUrl(
        "http://127.0.0.1:5173/../outside.md",
      ),
    ).toBeNull();
  });
});
