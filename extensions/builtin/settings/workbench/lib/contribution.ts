import {
  type ExtensionCommandContribution,
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "@axon-editor/shared/extensions";

export const AXON_SETTINGS_EXTENSION_ID = "axon.settings";
export const AXON_SETTINGS_VIEW_ID = "axon.settings";
export const AXON_SETTINGS_OPEN_COMMAND_ID = "axon.settings.open";
export const AXON_SETTINGS_OPEN_JSON_COMMAND_ID = "axon.settings.openJson";

export interface SettingsWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  openCommandId: string;
  openJsonCommandId: string;
}

// Settings is a privileged built-in surface, but it still needs to flow through
// the same contribution path as third-party views. If the Settings extension is
// disabled or its manifest stops declaring the modal view, the workbench should
// stop mounting the modal instead of hiding the registry problem behind a
// direct import.
export function resolveSettingsWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): SettingsWorkbenchContribution | null {
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  const viewRecords =
    registry.views as ExtensionContributionRecord<ExtensionViewContribution>[];
  const commandRecords =
    registry.commands as ExtensionContributionRecord<ExtensionCommandContribution>[];

  const viewRecord = viewRecords.find(
    (record) =>
      record.extensionId === AXON_SETTINGS_EXTENSION_ID &&
      record.contribution.id === AXON_SETTINGS_VIEW_ID &&
      record.contribution.location === "modal",
  );
  const openCommand = commandRecords.find(
    (record) =>
      record.extensionId === AXON_SETTINGS_EXTENSION_ID &&
      record.contribution.id === AXON_SETTINGS_OPEN_COMMAND_ID,
  );
  const openJsonCommand = commandRecords.find(
    (record) =>
      record.extensionId === AXON_SETTINGS_EXTENSION_ID &&
      record.contribution.id === AXON_SETTINGS_OPEN_JSON_COMMAND_ID,
  );

  if (!viewRecord || !openCommand || !openJsonCommand) return null;

  return {
    extensionId: AXON_SETTINGS_EXTENSION_ID,
    viewId: viewRecord.contribution.id,
    viewTitle: viewRecord.contribution.title,
    openCommandId: openCommand.contribution.id,
    openJsonCommandId: openJsonCommand.contribution.id,
  };
}
