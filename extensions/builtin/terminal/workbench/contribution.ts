import {
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionTerminalProfileContribution,
  type ExtensionViewContribution,
} from "@axon-editor/shared/extensions";

export const AXON_TERMINAL_EXTENSION_ID = "axon.terminal";
export const AXON_TERMINAL_VIEW_ID = "axon.terminal";
export const AXON_TERMINAL_DEFAULT_PROFILE_ID = "axon.terminal.default";

export interface TerminalWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  defaultProfileId: string;
  defaultProfileTitle: string;
}

// The terminal workbench surface should be activated from extension
// contributions, not from a hard-coded React import alone. This resolver keeps
// the first migration step intentionally strict: Axon mounts the built-in
// terminal only when the terminal extension contributes the expected panel view
// and default profile. If a future extension registry change breaks that
// contract, the workbench fails closed instead of showing a half-wired terminal.
export function resolveTerminalWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): TerminalWorkbenchContribution | null {
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  const viewRecords =
    registry.views as ExtensionContributionRecord<ExtensionViewContribution>[];
  const profileRecords =
    registry.terminalProfiles as ExtensionContributionRecord<ExtensionTerminalProfileContribution>[];

  const viewRecord = viewRecords.find(
    (record) =>
      record.extensionId === AXON_TERMINAL_EXTENSION_ID &&
      record.contribution.id === AXON_TERMINAL_VIEW_ID &&
      record.contribution.location === "panel",
  );
  const profileRecord = profileRecords.find(
    (record) =>
      record.extensionId === AXON_TERMINAL_EXTENSION_ID &&
      record.contribution.id === AXON_TERMINAL_DEFAULT_PROFILE_ID,
  );

  if (!viewRecord || !profileRecord) return null;

  return {
    extensionId: AXON_TERMINAL_EXTENSION_ID,
    viewId: viewRecord.contribution.id,
    viewTitle: viewRecord.contribution.title,
    defaultProfileId: profileRecord.contribution.id,
    defaultProfileTitle: profileRecord.contribution.title,
  };
}
