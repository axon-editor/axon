export type GitFileState =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "unknown";

export interface GitChange {
  path: string;
  absolutePath: string;
  oldPath: string | null;
  indexState: GitFileState;
  worktreeState: GitFileState;
  staged: boolean;
  unstaged: boolean;
}

export interface GitStatusResult {
  isRepository: boolean;
  root: string | null;
  branch: string | null;
  changes: GitChange[];
  ignoredPaths: string[];
}

export interface GitDiffResult {
  path: string;
  diff: string;
}

export interface GitActionResult {
  ok: boolean;
  message: string;
}

export interface GitCommitResult {
  ok: boolean;
  message: string;
}
