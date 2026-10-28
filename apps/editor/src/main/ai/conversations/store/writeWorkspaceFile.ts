/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { readJsonFile, writeJsonFileAtomic } from "../files/jsonFile";
import { type StoredWorkspace } from "../types";

export function writeWorkspaceFile(
  directory: string,
  folderPath: string | null,
) {
  const filePath = path.join(directory, "workspace.json");
  const existing = readJsonFile(filePath);
  if (isStoredWorkspace(existing) && existing.folderPath === folderPath) return;

  writeJsonFileAtomic(filePath, {
    version: 1,
    folderPath,
  } satisfies StoredWorkspace);
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredWorkspace>;
  return (
    candidate.version === 1 &&
    (candidate.folderPath === null || typeof candidate.folderPath === "string")
  );
}
