import {
  type ExtensionCommandContribution,
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "@axon-editor/shared/extensions";

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
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  const viewRecords =
    registry.views as ExtensionContributionRecord<ExtensionViewContribution>[];
  const commandRecords =
    registry.commands as ExtensionContributionRecord<ExtensionCommandContribution>[];

  const sourceControlView = viewRecords.find(
    (record) =>
      record.extensionId === AXON_GIT_EXTENSION_ID &&
      record.contribution.id === AXON_GIT_SOURCE_CONTROL_VIEW_ID &&
      record.contribution.location === "sidebar",
  );
  const historyView = viewRecords.find(
    (record) =>
      record.extensionId === AXON_GIT_EXTENSION_ID &&
      record.contribution.id === AXON_GIT_HISTORY_VIEW_ID &&
      record.contribution.location === "sidebar",
  );
  const openSourceControlCommand = commandRecords.find(
    (record) =>
      record.extensionId === AXON_GIT_EXTENSION_ID &&
      record.contribution.id === AXON_GIT_OPEN_SOURCE_CONTROL_COMMAND_ID,
  );
  const openHistoryCommand = commandRecords.find(
    (record) =>
      record.extensionId === AXON_GIT_EXTENSION_ID &&
      record.contribution.id === AXON_GIT_OPEN_HISTORY_COMMAND_ID,
  );

  if (
    !sourceControlView ||
    !historyView ||
    !openSourceControlCommand ||
    !openHistoryCommand
  ) {
    return null;
  }

  return {
    extensionId: AXON_GIT_EXTENSION_ID,
    sourceControlViewId: sourceControlView.contribution.id,
    sourceControlViewTitle: sourceControlView.contribution.title,
    historyViewId: historyView.contribution.id,
    historyViewTitle: historyView.contribution.title,
    openSourceControlCommandId: openSourceControlCommand.contribution.id,
    openHistoryCommandId: openHistoryCommand.contribution.id,
  };
}
