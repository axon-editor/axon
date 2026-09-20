/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type GitFileState } from "@axon-editor/shared/git";

export function getGitFileStateColor(state: GitFileState) {
  switch (state) {
    case "added":
    case "untracked":
      return "var(--axon-git-added)";
    case "modified":
      return "var(--axon-git-modified)";
    case "deleted":
      return "var(--axon-git-deleted)";
    case "renamed":
    case "copied":
      return "var(--axon-git-mixed)";
    default:
      return "var(--axon-editor-foreground)";
  }
}

export function getGitFileStateBadgeStyle(state: GitFileState) {
  const color = getGitFileStateColor(state);
  return {
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
  };
}
