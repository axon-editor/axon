/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { LANGUAGE_SERVER_BY_MONACO_LANGUAGE_ID } from "../../../../shared/editor/language/lsp/lsp";
import { LANGUAGE_SERVER_DEFINITIONS } from "./servers";

describe("language server definitions", () => {
  it("treats standalone Java files as Java workspaces", () => {
    const java = LANGUAGE_SERVER_DEFINITIONS.find(
      (definition) => definition.id === "java",
    );

    expect(java?.workspaceMarkers).toContain("*.java");
  });

  it("maps every Monaco language to a defined server", () => {
    const definedServerIds = new Set(
      LANGUAGE_SERVER_DEFINITIONS.map((definition) => definition.id),
    );

    for (const [monacoLanguageId, serverId] of Object.entries(
      LANGUAGE_SERVER_BY_MONACO_LANGUAGE_ID,
    )) {
      expect(
        definedServerIds.has(serverId),
        `${monacoLanguageId} maps to missing server ${serverId}`,
      ).toBe(true);
    }
  });

  it("keeps installed toolchain servers reachable from their languages", () => {
    // These are the servers that used to be missing from the renderer provider
    // lists even though the main process could start them.
    expect(Object.keys(LANGUAGE_SERVER_BY_MONACO_LANGUAGE_ID)).toEqual(
      expect.arrayContaining([
        "swift",
        "ruby",
        "dart",
        "sql",
        "toml",
        "zig",
        "terraform",
        "hcl",
        "latex",
        "bibtex",
        "scala",
        "clojure",
        "haskell",
        "erlang",
        "r",
        "powershell",
        "asm",
        "makefile",
      ]),
    );
  });
});
