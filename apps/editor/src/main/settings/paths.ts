/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app } from "electron";
import path from "path";

export function getUserSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

export function getWorkspaceSettingsPath(folderPath: string) {
  return path.join(folderPath, "axon.json");
}

export function getSettingsPath(folderPath?: string | null) {
  if (folderPath) return getWorkspaceSettingsPath(folderPath);
  return getUserSettingsPath();
}

export function getCustomFontsDirectory() {
  return path.join(app.getPath("userData"), "fonts");
}
