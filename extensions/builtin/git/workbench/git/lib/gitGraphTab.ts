import {
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
} from "@axon-editor/shared/git";

export const AXON_GIT_GRAPH_TAB_PATH = "axon-git://graph";
export const AXON_GIT_COMMIT_DIFF_TAB_PREFIX = "axon-git://commit-diff/";
export const AXON_OPEN_GIT_COMMIT_DIFF_EVENT = "axon:openGitCommitDiff";

export interface GitCommitDiffTabData {
  commit: GitHistoryCommit;
  file: GitHistoryFile;
  diff: GitCommitDiffResult;
}

export interface OpenGitCommitDiffDetail {
  tabPath: string;
}

const commitDiffTabs = new Map<string, GitCommitDiffTabData>();

export function isGitGraphTabPath(tabPath: string) {
  return tabPath === AXON_GIT_GRAPH_TAB_PATH;
}

export function isGitCommitDiffTabPath(tabPath: string) {
  return tabPath.startsWith(AXON_GIT_COMMIT_DIFF_TAB_PREFIX);
}

export function getGitCommitDiffTabData(tabPath: string) {
  return commitDiffTabs.get(tabPath) ?? null;
}

export function releaseGitCommitDiffTab(tabPath: string) {
  commitDiffTabs.delete(tabPath);
}

export function openGitCommitDiff(data: GitCommitDiffTabData) {
  // Diff contents can be large, so the tab identity contains only an opaque ID
  // and the actual payload stays in renderer memory. Encoding file contents in
  // the layout path would inflate every layout update and session write.
  const tabPath = `${AXON_GIT_COMMIT_DIFF_TAB_PREFIX}${crypto.randomUUID()}`;
  commitDiffTabs.set(tabPath, data);
  window.dispatchEvent(
    new CustomEvent<OpenGitCommitDiffDetail>(AXON_OPEN_GIT_COMMIT_DIFF_EVENT, {
      detail: { tabPath },
    }),
  );
}
