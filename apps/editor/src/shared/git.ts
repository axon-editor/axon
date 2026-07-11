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

export interface GitCloneResult {
  ok: boolean;
  canceled: boolean;
  message: string;
  folderPath: string | null;
}

export type GitCloneProgressPhase =
  | "starting"
  | "counting"
  | "compressing"
  | "receiving"
  | "resolving"
  | "checkout"
  | "complete";

export interface GitCloneProgress {
  phase: GitCloneProgressPhase;
  percent: number | null;
  message: string;
}

export interface GitCloneProgressEvent extends GitCloneProgress {
  requestId: string;
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

export interface GitConflictFile {
  path: string;
  absolutePath: string;
  stages: Array<"base" | "ours" | "theirs">;
}

export interface GitConflictListResult {
  ok: boolean;
  message: string;
  conflicts: GitConflictFile[];
}

export type GitConflictResolution =
  | { type: "ours"; path: string }
  | { type: "theirs"; path: string }
  | { type: "markResolved"; path: string };

export interface GitWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  bare: boolean;
  current: boolean;
}

export interface GitWorktreeListResult {
  ok: boolean;
  message: string;
  worktrees: GitWorktree[];
}

export type GitWorktreeAction =
  | { type: "add"; path: string; branch?: string; createBranch?: string }
  | { type: "remove"; path: string; force?: boolean }
  | { type: "prune" };

export interface GitGraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  refs: string[];
  subject: string;
  authorName: string;
  relativeDate: string;
  lane: number;
}

export interface GitGraphResult {
  ok: boolean;
  message: string;
  root: string | null;
  branch: string | null;
  commits: GitGraphCommit[];
}

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
