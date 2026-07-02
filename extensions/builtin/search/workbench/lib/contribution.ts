import {
  type ExtensionCommandContribution,
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "@axon-editor/shared/extensions";

export const AXON_SEARCH_EXTENSION_ID = "axon.search";
export const AXON_SEARCH_WORKSPACE_VIEW_ID = "axon.search.workspace";
export const AXON_SEARCH_OPEN_COMMAND_ID = "axon.search.openWorkspace";

export interface SearchWorkbenchContribution {
  extensionId: string;
  workspaceViewId: string;
  workspaceViewTitle: string;
  openCommandId: string;
  openCommandTitle: string;
}

// Search is still rendered by the core workbench shell, but this resolver makes
// the shell depend on the extension registry contract instead of assuming that
// the built-in Search package is always present and enabled. That matters for
// the extension-host migration because disabled, broken, or replaced search
// packages should change the available UI in one place: the contribution
// registry produced by the host.
export function resolveSearchWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): SearchWorkbenchContribution | null {
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  const viewRecords =
    registry.views as ExtensionContributionRecord<ExtensionViewContribution>[];
  const commandRecords =
    registry.commands as ExtensionContributionRecord<ExtensionCommandContribution>[];

  const viewRecord = viewRecords.find(
    (record) =>
      record.extensionId === AXON_SEARCH_EXTENSION_ID &&
      record.contribution.id === AXON_SEARCH_WORKSPACE_VIEW_ID &&
      record.contribution.location === "modal",
  );
  const commandRecord = commandRecords.find(
    (record) =>
      record.extensionId === AXON_SEARCH_EXTENSION_ID &&
      record.contribution.id === AXON_SEARCH_OPEN_COMMAND_ID,
  );

  if (!viewRecord || !commandRecord) return null;

  return {
    extensionId: AXON_SEARCH_EXTENSION_ID,
    workspaceViewId: viewRecord.contribution.id,
    workspaceViewTitle: viewRecord.contribution.title,
    openCommandId: commandRecord.contribution.id,
    openCommandTitle: commandRecord.contribution.title,
  };
}
