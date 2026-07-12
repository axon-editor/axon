import {
  type GitCommitDiffResult,
  type GitHistoryCommit,
  type GitHistoryFile,
} from "@axon-editor/shared/git";

export const AXON_GIT_GRAPH_TAB_PATH = "axon-git://graph";
export const AXON_OPEN_GIT_COMMIT_DIFF_EVENT = "axon:openGitCommitDiff";

export interface OpenGitCommitDiffDetail {
  commit: GitHistoryCommit;
  file: GitHistoryFile;
  diff: GitCommitDiffResult;
}

export function isGitGraphTabPath(tabPath: string) {
  return tabPath === AXON_GIT_GRAPH_TAB_PATH;
}

export function openGitCommitDiff(detail: OpenGitCommitDiffDetail) {
  window.dispatchEvent(
    new CustomEvent<OpenGitCommitDiffDetail>(AXON_OPEN_GIT_COMMIT_DIFF_EVENT, {
      detail,
    }),
  );
}
