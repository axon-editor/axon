/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { writeTextFileAtomic } from "../files/writeTextFileAtomic";
import { textFileCache } from "../files/textFileCache";
import { type WorkspaceCapabilityRegistry } from "./workspaceCapabilities";

export const MAX_WORKSPACE_TEXT_FILE_BYTES = 32 * 1024 * 1024;

// Both the editor save handler and the agent tool loop need the same capability
// check, size ceiling, atomic replacement, and cache upkeep. Keeping that chain
// in one place stops the agent path from slowly drifting away from normal saves
// as either side gains new guards.
export async function writeWorkspaceTextFile(
  registry: WorkspaceCapabilityRegistry,
  rendererId: number,
  filePath: string,
  content: string,
) {
  if (typeof content !== "string") {
    throw new Error("File content must be text.");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_WORKSPACE_TEXT_FILE_BYTES) {
    throw new Error("File is too large to save through the text editor.");
  }

  const authorizedPath = registry.assertWritablePath(rendererId, filePath);
  await writeTextFileAtomic(authorizedPath, content);
  try {
    await textFileCache.recordWrite(authorizedPath, content);
  } catch {
    // The disk write has already succeeded. A formatter or another process can
    // replace or remove the path before this stat completes, so cache upkeep
    // must fall back to invalidation instead of reporting a false save failure.
    textFileCache.invalidate(authorizedPath);
  }
  return authorizedPath;
}
