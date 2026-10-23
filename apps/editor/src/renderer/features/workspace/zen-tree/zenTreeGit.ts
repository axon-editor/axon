/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
  GitChange,
  GitFileState,
} from "../../../../shared/workspace/git";
import type { GitTone } from "./types";
import { normalizeTreePath } from "./zenTreePath";

export const GIT_TONE_COLORS: Record<GitTone, string> = {
  added: "var(--axon-git-added)",
  modified: "var(--axon-git-modified)",
  deleted: "var(--axon-git-deleted)",
  mixed: "var(--axon-git-mixed)",
};

export const IGNORED_ENTRY_COLOR =
  "color-mix(in srgb, var(--axon-editor-foreground) 56%, transparent)";

function getGitToneFromState(state: GitFileState): GitTone | null {
  if (state === "added" || state === "untracked") return "added";
  if (state === "deleted") return "deleted";
  if (state === "modified" || state === "renamed" || state === "copied") {
    return "modified";
  }
  return null;
}

function mergeGitTones(current: GitTone | undefined, next: GitTone) {
  if (!current) return next;
  if (current === next) return current;
  return "mixed";
}

export function buildGitDecorationMap(changes: GitChange[]) {
  const decorations = new Map<string, GitTone>();

  for (const change of changes) {
    const tone =
      getGitToneFromState(change.worktreeState) ??
      getGitToneFromState(change.indexState) ??
      "modified";
    let currentPath = normalizeTreePath(change.absolutePath);

    while (currentPath) {
      decorations.set(
        currentPath,
        mergeGitTones(decorations.get(currentPath), tone),
      );

      const nextPath = currentPath.split("/").slice(0, -1).join("/");
      if (nextPath === currentPath) break;
      currentPath = nextPath;
    }
  }

  return decorations;
}

export function buildIgnoredPathSet(ignoredPaths: string[]) {
  return new Set(ignoredPaths.map(normalizeTreePath));
}
