/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Compiles the Axon Finder Sync extension (native/finder-extension) into a
// signed .appex bundle that electron-builder embeds under Contents/PlugIns.
// The Finder only loads a Finder Sync extension from a signed app bundle, so
// the script assembles the standard appex layout (Contents/MacOS + Info.plist)
// and code signs it. The build targets both Apple Silicon and Intel so one
// artifact serves dmg/zip builds for either architecture.
//
// This script is macOS-only and intentionally isolated inside the dist:mac npm
// commands. Linux/Windows CI must never try to compile Swift, and there is no
// reason for a plain `npm run test` or the browser bundles to pay for it.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..", "..");
const sourceRoot = path.join(editorRoot, "native", "finder-extension");
const outputDir = path.join(editorRoot, "build", "native");
const appexPath = path.join(outputDir, "AxonFinderSync.appex");
const contentsDir = path.join(appexPath, "Contents");
const executablePath = path.join(contentsDir, "MacOS", "AxonFinderSync");

const ARCHES = ["arm64", "x86_64"];
const MACOSX_DEPLOYMENT_TARGET = "11.0";

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : `exited with status ${result.status}`;
    console.error(`\n[build-finder-extension] ${label} failed: ${detail}`);
    process.exit(result.status ?? 1);
  }
}

if (process.platform !== "darwin") {
  console.error(
    "[build-finder-extension] Skipping: the Finder Sync extension is macOS-only.",
  );
  process.exit(0);
}

// Locate the macOS SDK so both architectures compile against the same one.
const sdkResult = spawnSync("xcrun", ["--show-sdk-path", "--sdk", "macosx"], {
  encoding: "utf8",
});
if (sdkResult.status !== 0 || !sdkResult.stdout.trim()) {
  console.error(
    "[build-finder-extension] macOS SDK not found. Install Xcode command line tools.",
  );
  process.exit(1);
}
const sdkPath = sdkResult.stdout.trim();

// swiftc cannot emit two architectures in a single invocation, so each arch is
// compiled to its own object file and then fused with lipo.
mkdirSync(path.join(outputDir, "objects"), { recursive: true });
const objectPaths = [];
for (const arch of ARCHES) {
  const objectPath = path.join(outputDir, "objects", `AxonFinderSync-${arch}.o`);
  run(
    `compile ${arch}`,
    "xcrun",
    [
      "--sdk", "macosx",
      "swiftc",
      "-O",
      "-target", `${arch}-apple-macosx${MACOSX_DEPLOYMENT_TARGET}`,
      "-sdk", sdkPath,
      "-framework", "FinderSync",
      "-framework", "AppKit",
      "-c",
      "-o", objectPath,
      path.join(sourceRoot, "AxonFinderSync.swift"),
    ],
  );
  objectPaths.push(objectPath);
}

mkdirSync(path.join(contentsDir, "MacOS"), { recursive: true });
run(
  "link universal binary",
  "xcrun",
  ["lipo", "-create", ...objectPaths, "-output", executablePath],
);
run("copy Info.plist", "xcrun", ["plutil", "-lint", path.join(sourceRoot, "Info.plist")]);
cpSync(path.join(sourceRoot, "Info.plist"), path.join(contentsDir, "Info.plist"));

// A real signing identity can be supplied when packaging a release (for
// example from the electron-builder signing environment). Ad-hoc signing is the
// fallback so local dmg/zip artifacts still load in Finder for testing. Hardened
// runtime only makes sense when there is a real identity to notarize with.
const identity = process.env.AXON_FINDER_SIGN_IDENTITY ?? "-";
const signArgs = ["--force", "--sign", identity, "--timestamp=none"];
if (identity !== "-") {
  signArgs.push("--options", "runtime");
}
run("sign appex", "codesign", [...signArgs, appexPath]);

run("verify signature", "codesign", ["--verify", appexPath]);

rmSync(path.join(outputDir, "objects"), { recursive: true, force: true });

writeFileSync(
  path.join(outputDir, "finder-extension-resolved.json"),
  JSON.stringify(
    {
      appexPath,
      relativeToEditor: "build/native/AxonFinderSync.appex",
      arches: ARCHES,
      signed: identity,
      macOSDeploymentTarget: MACOSX_DEPLOYMENT_TARGET,
    },
    null,
    "  ",
  ),
);

console.log(`\n[build-finder-extension] Built and signed ${appexPath}`);
console.log("[build-finder-extension] Signature:", identity);