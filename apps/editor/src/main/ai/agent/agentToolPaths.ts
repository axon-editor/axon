/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";

const URI_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

// The model can send a workspace-relative path or an absolute path. Resolving
// it in the main process keeps the write independent of renderer path handling,
// while the capability registry still decides whether it is inside the workspace.
export function resolveAgentWritePath(folderPath: string, rawPath: string) {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) throw new Error("No file path was provided.");
  if (URI_SCHEME_PATTERN.test(trimmedPath)) {
    throw new Error("write_file needs a filesystem path, not a tab URI.");
  }
  return path.resolve(folderPath, trimmedPath);
}
