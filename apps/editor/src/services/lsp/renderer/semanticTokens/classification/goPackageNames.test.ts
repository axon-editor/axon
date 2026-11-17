/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectGoPackageNames } from "./goPackageNames";

describe("collectGoPackageNames", () => {
  it("reads block imports, single imports, aliases, and version segments", () => {
    const content = [
      "package main",
      "import (",
      '  "net/http"',
      '  alias "example.com/some/pkg"',
      '  "example.com/lib/v2"',
      '  "gopkg.in/yaml.v3"',
      '  _ "embed"',
      '  . "dotimport"',
      ")",
      'import "fmt"',
    ].join("\n");

    expect([...collectGoPackageNames(content)].sort()).toEqual([
      "alias",
      "fmt",
      "http",
      "lib",
      "yaml",
    ]);
  });

  it("keeps package names out of ordinary code", () => {
    const content = ["package main", "func f() {", "  _ = h.value", "}"].join(
      "\n",
    );

    expect(collectGoPackageNames(content).size).toBe(0);
  });
});
