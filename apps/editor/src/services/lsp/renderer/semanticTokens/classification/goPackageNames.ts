/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TextMate scopes Go selectors identically for imported packages and local
// values. The import block is the only place that tells the two apart, so this
// parser turns the file's imports into the set of identifiers that can be a
// package qualifier.

function goImportLocalName(specifier: string) {
  const segments = specifier.split("/").filter(Boolean);
  let lastSegment = segments.at(-1) ?? "";
  // A module path can end in a major-version segment (`example.com/lib/v2`);
  // the package identifier comes from the segment before it.
  if (/^v\d+$/.test(lastSegment)) {
    lastSegment = segments.at(-2) ?? lastSegment;
  }
  // Import paths such as `gopkg.in/yaml.v3` keep the version in the last
  // segment, so the package name stops at the first dot.
  return lastSegment.split(".")[0] ?? "";
}

export function collectGoPackageNames(content: string) {
  const packageNames = new Set<string>();
  let insideImportBlock = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!insideImportBlock && line === "import (") {
      insideImportBlock = true;
      continue;
    }
    if (insideImportBlock && line === ")") {
      insideImportBlock = false;
      continue;
    }

    const specLine = insideImportBlock
      ? line
      : line.startsWith("import ")
        ? line.slice("import ".length).trim()
        : "";
    if (!specLine) continue;

    const match = specLine.match(/^(?:([A-Za-z_.]\w*)\s+)?["`]([^"`]+)["`]/);
    if (!match) continue;
    const alias = match[1];
    const specifier = match[2] ?? "";
    if (alias === "_" || alias === ".") continue;
    if (alias) {
      packageNames.add(alias);
      continue;
    }
    const localName = goImportLocalName(specifier);
    if (localName) packageNames.add(localName);
  }

  return packageNames;
}
