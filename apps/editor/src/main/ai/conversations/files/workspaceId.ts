/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "crypto";
import path from "path";

const MAX_WORKSPACE_SLUG_LENGTH = 60;
const WORKSPACE_HASH_LENGTH = 10;

export function normalizedFolderPath(folderPath: string | null): string | null {
  return folderPath ? path.resolve(folderPath) : null;
}

export function workspaceId(folderPath: string | null): string {
  const normalized = normalizedFolderPath(folderPath);
  if (!normalized) return "no-workspace";

  const slug =
    path
      .basename(normalized)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_WORKSPACE_SLUG_LENGTH)
      .replace(/-+$/g, "") || "workspace";
  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, WORKSPACE_HASH_LENGTH);
  return `${slug}-${hash}`;
}

export function workspaceDirectory(
  sessionsRoot: string,
  folderPath: string | null,
): string {
  return path.join(sessionsRoot, workspaceId(folderPath));
}
