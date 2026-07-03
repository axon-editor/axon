import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_GIT_EXTENSION_ID = "axon.git";
export const AXON_GIT_SOURCE_CONTROL_VIEW_ID = "axon.sourceControl";
export const AXON_GIT_HISTORY_VIEW_ID = "axon.history";
export const AXON_GIT_OPEN_SOURCE_CONTROL_COMMAND_ID =
  "axon.git.openSourceControl";
export const AXON_GIT_OPEN_HISTORY_COMMAND_ID = "axon.git.openHistory";

export interface GitWorkbenchContribution {
  extensionId: string;
  sourceControlViewId: string;
  sourceControlViewTitle: string;
  historyViewId: string;
  historyViewTitle: string;
  openSourceControlCommandId: string;
  openHistoryCommandId: string;
}

// Source control touches repository state, diffs, history, stashes, and
// worktrees, so the workbench should only mount it when the Git extension has
// declared both sidebar views and their commands. This keeps the built-in Git
// surface tied to extension activation instead of becoming another private
// workbench shortcut that future extension packages cannot replace cleanly.
export function resolveGitWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): GitWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.git,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_GIT_EXTENSION_ID,
    sourceControlViewId: AXON_GIT_SOURCE_CONTROL_VIEW_ID,
    sourceControlViewTitle:
      resolved.views[AXON_GIT_SOURCE_CONTROL_VIEW_ID]?.title ??
      "Source Control",
    historyViewId: AXON_GIT_HISTORY_VIEW_ID,
    historyViewTitle: resolved.views[AXON_GIT_HISTORY_VIEW_ID]?.title ?? "History",
    openSourceControlCommandId: AXON_GIT_OPEN_SOURCE_CONTROL_COMMAND_ID,
    openHistoryCommandId: AXON_GIT_OPEN_HISTORY_COMMAND_ID,
  };
}
