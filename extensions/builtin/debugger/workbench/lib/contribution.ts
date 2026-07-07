import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_DEBUGGER_EXTENSION_ID = "axon.debugger";
export const AXON_DEBUGGER_VIEW_ID = "axon.debug";
export const AXON_DEBUGGER_OPEN_COMMAND_ID = "axon.debug.open";

export interface DebuggerWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  openCommandId: string;
  debuggerTypes: string[];
}

export function resolveDebuggerWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): DebuggerWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.debugger,
  );
  if (!resolved) return null;

  const debuggerTypes =
    extensionState?.contributionRegistry.debuggerProviders
      .filter((record) => record.extensionId === AXON_DEBUGGER_EXTENSION_ID)
      .map((record) => record.contribution.type) ?? [];

  // The debugger UI is not mounted in this pass, but this resolver creates the
  // same boundary Search, Git, Testing, and Terminal already use: the workbench
  // can only expose debugger affordances when the extension manifest contributes
  // the command, view, and provider types that make the surface meaningful.
  return {
    extensionId: AXON_DEBUGGER_EXTENSION_ID,
    viewId: AXON_DEBUGGER_VIEW_ID,
    viewTitle: resolved.views[AXON_DEBUGGER_VIEW_ID]?.title ?? "Debug",
    openCommandId: AXON_DEBUGGER_OPEN_COMMAND_ID,
    debuggerTypes,
  };
}
