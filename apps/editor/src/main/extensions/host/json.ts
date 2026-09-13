/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";

// Extension manifests, enablement state, and marketplace packages are all loaded
// on the main process during startup and extension reloads. Parsing them
// asynchronously keeps a slow disk or a large marketplace from blocking every
// renderer IPC message while the editor is first appearing.
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
