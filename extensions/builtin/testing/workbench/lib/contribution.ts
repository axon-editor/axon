import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_TESTING_EXTENSION_ID = "axon.testing";
export const AXON_TESTING_VIEW_ID = "axon.tests";
export const AXON_TESTING_OPEN_COMMAND_ID = "axon.testing.open";
export const AXON_TESTING_REFRESH_COMMAND_ID = "axon.testing.refresh";

export interface TestingWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  openCommandId: string;
  refreshCommandId: string;
}

export function resolveTestingWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): TestingWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.testing,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_TESTING_EXTENSION_ID,
    viewId: AXON_TESTING_VIEW_ID,
    viewTitle:
      resolved.views[AXON_TESTING_VIEW_ID]?.title ?? "Tests",
    openCommandId: AXON_TESTING_OPEN_COMMAND_ID,
    refreshCommandId: AXON_TESTING_REFRESH_COMMAND_ID,
  };
}
