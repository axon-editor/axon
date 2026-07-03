import {
  BUILTIN_WORKBENCH_CONTRIBUTIONS,
  resolveRequiredWorkbenchContribution,
} from "@axon-editor/workbench/contrib/extensions/lib/builtinWorkbenchContributions";
import { type ExtensionState } from "@axon-editor/shared/extensions";

export const AXON_TASKS_EXTENSION_ID = "axon.tasks";
export const AXON_TASKS_VIEW_ID = "axon.tasks";
export const AXON_TASKS_RUN_COMMAND_ID = "axon.tasks.run";

export interface TasksWorkbenchContribution {
  extensionId: string;
  viewId: string;
  viewTitle: string;
  runCommandId: string;
}

export function resolveTasksWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
): TasksWorkbenchContribution | null {
  const resolved = resolveRequiredWorkbenchContribution(
    extensionState,
    BUILTIN_WORKBENCH_CONTRIBUTIONS.tasks,
  );
  if (!resolved) return null;

  return {
    extensionId: AXON_TASKS_EXTENSION_ID,
    viewId: AXON_TASKS_VIEW_ID,
    viewTitle: resolved.views[AXON_TASKS_VIEW_ID]?.title ?? "Tasks",
    runCommandId: AXON_TASKS_RUN_COMMAND_ID,
  };
}
