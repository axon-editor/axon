/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Development loads extensions straight from the repository, while a packaged
// app reads them out of app.asar. Comparing the two sets after packaging catches
// a theme or extension that works in development but never shipped.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(scriptDirectory, "..", "..");
const workspaceRoot = path.resolve(editorRoot, "..", "..");
const releaseRoot = path.join(editorRoot, "release");
const manifestFile = "axon.extension.json";
const extensionRoots = [
  path.join(workspaceRoot, "extensions", "builtin"),
  path.join(workspaceRoot, "extensions", "marketplace"),
];

const findFiles = (root, matches) => {
  const matchesFound = [];
  const visit = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (matches(entry)) matchesFound.push(entryPath);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return matchesFound;
};

const expectedManifests = extensionRoots
  .flatMap((root) =>
    findFiles(root, (entry) => entry.name === manifestFile),
  )
  .map((manifestPath) => path.relative(workspaceRoot, manifestPath))
  .sort();

const packagedArchives = findFiles(
  releaseRoot,
  (entry) => entry.name === "app.asar",
);

if (packagedArchives.length === 0) {
  console.error(
    `No packaged app.asar found under ${releaseRoot}. Run a dist build first.`,
  );
  process.exit(1);
}

let failed = false;

for (const archivePath of packagedArchives) {
  const entries = new Set(
    asar
      .listPackage(archivePath)
      .map((entry) => entry.replace(/^\/+/, "")),
  );
  const missing = expectedManifests.filter((entry) => !entries.has(entry));

  console.log(
    `${path.relative(editorRoot, archivePath)}: expected ${expectedManifests.length} extension manifests, ` +
      `found ${expectedManifests.length - missing.length}.`,
  );

  if (missing.length === 0) continue;

  failed = true;
  console.error("Missing packaged extensions:");
  for (const entry of missing) console.error(`  ${entry}`);
}

if (failed) process.exit(1);
