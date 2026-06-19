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
  baseContent?: string;
  currentContent?: string;
}

export interface GitActionResult {
  ok: boolean;
  message: string;
}

export interface GitCommitResult {
  ok: boolean;
  message: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

export interface GitBranchListResult {
  ok: boolean;
  message: string;
  current: string | null;
  branches: GitBranch[];
}

export type GitBranchAction =
  | { type: "checkout"; name: string }
  | { type: "create"; name: string; checkout?: boolean }
  | { type: "delete"; name: string; force?: boolean }
  | { type: "rename"; oldName: string; newName: string };

export interface GitStashEntry {
  index: number;
  selector: string;
  branch: string;
  message: string;
}

export interface GitStashListResult {
  ok: boolean;
  message: string;
  stashes: GitStashEntry[];
}

export type GitStashAction =
  | { type: "create"; message?: string; includeUntracked?: boolean }
  | { type: "apply"; selector: string }
  | { type: "pop"; selector: string }
  | { type: "drop"; selector: string };

export interface GitHistoryCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorAvatarUrl: string;
  date: string;
  relativeDate: string;
  body: string;
  files: GitHistoryFile[];
}

export interface GitHistoryFile {
  path: string;
  absolutePath: string;
  oldPath: string | null;
  status: GitFileState;
}

export interface GitHistoryResult {
  isRepository: boolean;
  root: string | null;
  branch: string | null;
  commits: GitHistoryCommit[];
}

export interface GitCommitDiffResult {
  hash: string;
  path: string | null;
  diff: string;
  baseContent?: string;
  currentContent?: string;
}
