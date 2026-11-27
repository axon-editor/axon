/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GitStatusResult } from "../../../../../shared/workspace/git";

// A status scan that fails after a repository was already painted should not
// make the workbench look like an empty repository. Keeping the previous
// changes and branch keeps Git line paint and Source Control usable until the
// next successful scan replaces them.
export function mergeGitStatusResult(
  previous: GitStatusResult | null,
  next: GitStatusResult,
): GitStatusResult {
  if (
    !next.degraded ||
    !previous?.isRepository ||
    !next.root ||
    previous.root !== next.root
  ) {
    return next;
  }

  return {
    ...next,
    branch: previous.branch ?? next.branch,
    changes: previous.changes,
    ignoredPaths: previous.ignoredPaths,
  };
}
