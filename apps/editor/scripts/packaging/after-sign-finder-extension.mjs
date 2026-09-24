/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// electron-builder mac afterSign hook. electron-builder already deep-signs the
// nested AxonFinderSync.appex when it signs the app, so this hook does not
// re-sign anything; it only verifies that the extension actually landed in
// Contents/PlugIns inside the finished bundle and that it still advertises
// itself as a valid Finder Sync extension. A silent packaging regression here
// would ship an app whose Finder toggle cannot work, so malformed extensions
// fail the build. A missing extension only warns: `pack` and the all-platform
// `dist` commands run on macOS without the mac dist scripts' Swift build step,
// and failing those convenience paths helps nobody.

import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EXTENSION_NAME = "AxonFinderSync.appex";

export default async function afterSign(context) {
  const { appOutDir, electronPlatformName } = context;
  if (electronPlatformName !== "darwin") return;

  const productName = context.packager.appInfo.productName;
  const appexPath = path.join(
    appOutDir,
    `${productName}.app`,
    "Contents",
    "PlugIns",
    EXTENSION_NAME,
  );

  if (!existsSync(appexPath)) {
    console.warn(
      `[after-sign-finder-extension] ${EXTENSION_NAME} not found in ${appOutDir}. ` +
        "Run the dist:mac commands (which build the extension first) for Finder " +
        "integration in the packaged app.",
    );
    return;
  }

  const plistResult = spawnSync(
    "xcrun",
    ["plutil", "-convert", "json", "-o", "-", path.join(appexPath, "Contents", "Info.plist")],
    { encoding: "utf8" },
  );
  if (plistResult.status !== 0) {
    throw new Error(
      `[after-sign-finder-extension] Failed to read ${EXTENSION_NAME} Info.plist`,
    );
  }

  const info = JSON.parse(plistResult.stdout);
  const pointId = info?.NSExtension?.NSExtensionPointIdentifier;
  const principalClass = info?.NSExtension?.NSExtensionPrincipalClass;
  if (pointId !== "com.apple.FinderSync" || !principalClass) {
    throw new Error(
      `[after-sign-finder-extension] ${EXTENSION_NAME} is not a Finder Sync extension ` +
        `(NSExtensionPointIdentifier=${pointId}, principalClass=${principalClass})`,
    );
  }

  const verify = spawnSync(
    "codesign",
    ["--verify", "--deep", appexPath],
    { stdio: "inherit" },
  );
  if (verify.status !== 0) {
    throw new Error(
      `[after-sign-finder-extension] ${EXTENSION_NAME} signature is invalid`,
    );
  }

  console.log(
    `[after-sign-finder-extension] Verified ${EXTENSION_NAME} in the packaged app.`,
  );
}