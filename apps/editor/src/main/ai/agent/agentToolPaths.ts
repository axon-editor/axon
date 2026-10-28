/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";

const URI_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

// The model can send a workspace-relative path or an absolute path. Resolving
// it in the main process keeps filesystem tools independent of renderer path
// handling, while the capability registry still decides whether it is inside
// the workspace.
function resolveAgentToolPath(
  folderPath: string,
  rawPath: string,
  toolName: string,
  pathKind: string,
) {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) throw new Error(`No ${pathKind} path was provided.`);
  if (URI_SCHEME_PATTERN.test(trimmedPath)) {
    throw new Error(`${toolName} needs a filesystem path, not a tab URI.`);
  }
  return path.resolve(folderPath, trimmedPath);
}

export function resolveAgentWritePath(folderPath: string, rawPath: string) {
  return resolveAgentToolPath(folderPath, rawPath, "write_file", "file");
}

export function resolveAgentDirectoryPath(
  folderPath: string,
  rawPath: string,
) {
  return resolveAgentToolPath(
    folderPath,
    rawPath,
    "create_directory",
    "folder",
  );
}
