/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { type WorkspaceCapabilityRegistry } from "./workspaceCapabilities";

// Folder creation goes through the same capability check as a file write so a
// model cannot turn a relative path into a symlink escape or create folders in
// another renderer's workspace. Recursive mkdir keeps the tool useful for nested
// component folders without asking the model to create each parent separately.
export async function createWorkspaceDirectory(
  registry: WorkspaceCapabilityRegistry,
  rendererId: number,
  directoryPath: string,
) {
  const authorizedPath = registry.assertWritablePath(rendererId, directoryPath);
  await fs.promises.mkdir(authorizedPath, { recursive: true });
  return authorizedPath;
}
