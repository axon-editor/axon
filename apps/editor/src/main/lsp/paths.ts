/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app } from "electron";
import fs from "fs";
import path from "path";

export function getBundledAppFilePath(...segments: string[]) {
  const packagedPath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ...segments,
  );
  if (app.isPackaged && fs.existsSync(packagedPath)) return packagedPath;

  const appPath = path.join(app.getAppPath(), ...segments);
  if (app.isPackaged || fs.existsSync(appPath)) return appPath;

  const workspacePath = path.resolve(app.getAppPath(), "..", "..", ...segments);
  return fs.existsSync(workspacePath) ? workspacePath : appPath;
}

export function resolveBundledAppFilePath(...segments: string[]) {
  const candidate = getBundledAppFilePath(...segments);
  return fs.existsSync(candidate) ? candidate : "";
}
