import {
  type GitChange,
  type GitDiffResult,
  type GitStatusResult,
} from "@axon-editor/shared/git";

export type GitMutationAction = "stage" | "unstage" | "discard";

export async function loadSourceControlStatus(
  folderPath: string,
): Promise<GitStatusResult> {
  return window.axon.getGitStatus(folderPath);
}

export async function runSourceControlAction(
  folderPath: string,
  change: GitChange,
  action: GitMutationAction,
) {
  return window.axon.runGitAction(folderPath, change.path, action);
}

export async function runSourceControlBatchAction(
  folderPath: string,
  changes: GitChange[],
  action: GitMutationAction,
) {
  // The UI can pass staged and unstaged groups together, but each Git mutation
  // must still be narrowed to files that can actually accept that action.
  // Keeping the filter in the Git service helper prevents future source-control
  // views from accidentally discarding or staging files outside the visible set.
  const actionableChanges = changes.filter((change) => {
    if (action === "stage") return change.unstaged;
    if (action === "unstage") return change.staged;
    return change.unstaged;
  });

  for (const change of actionableChanges) {
    await runSourceControlAction(folderPath, change, action);
  }

  return actionableChanges;
}

export async function commitSourceControlChanges(
  folderPath: string,
  message: string,
) {
  return window.axon.commitGitChanges(folderPath, message);
}

export async function loadSourceControlDiff(
  folderPath: string,
  change: GitChange,
): Promise<GitDiffResult> {
  return window.axon.getGitDiff(
    folderPath,
    change.path,
    change.staged,
    change.indexState === "untracked",
  );
}

export async function copyGitText(text: string) {
  return window.axon.copyText(text);
}
