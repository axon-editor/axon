import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_LANGUAGE_TOOLS_EXTENSION_ID = "axon.languageTools";
export const AXON_LANGUAGE_TOOLS_VIEW_ID = "axon.languageTools";
export const AXON_LANGUAGE_TOOLS_OPEN_COMMAND_ID = "axon.languageTools.open";

export interface LanguageToolsWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  openCommandId: string;
}

export function resolveLanguageToolsWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): LanguageToolsWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.languageTools,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_LANGUAGE_TOOLS_EXTENSION_ID,
    viewId: AXON_LANGUAGE_TOOLS_VIEW_ID,
    viewTitle:
      resolved.views[AXON_LANGUAGE_TOOLS_VIEW_ID]?.title ?? "Language Tools",
    openCommandId: AXON_LANGUAGE_TOOLS_OPEN_COMMAND_ID,
  };
}
