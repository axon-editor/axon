import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

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
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.search,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_SEARCH_EXTENSION_ID,
    workspaceViewId: AXON_SEARCH_WORKSPACE_VIEW_ID,
    workspaceViewTitle:
      resolved.views[AXON_SEARCH_WORKSPACE_VIEW_ID]?.title ?? "Workspace Search",
    openCommandId: AXON_SEARCH_OPEN_COMMAND_ID,
    openCommandTitle:
      resolved.commands[AXON_SEARCH_OPEN_COMMAND_ID]?.title ?? "Search Workspace",
  };
}
