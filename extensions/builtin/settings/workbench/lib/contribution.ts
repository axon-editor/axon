import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

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
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.settings,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_SETTINGS_EXTENSION_ID,
    viewId: AXON_SETTINGS_VIEW_ID,
    viewTitle: resolved.views[AXON_SETTINGS_VIEW_ID]?.title ?? "Settings",
    openCommandId: AXON_SETTINGS_OPEN_COMMAND_ID,
    openJsonCommandId: AXON_SETTINGS_OPEN_JSON_COMMAND_ID,
  };
}
