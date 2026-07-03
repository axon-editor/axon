import {
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "../../../../shared/extensions";

export interface WorkbenchExtensionView {
  id: string;
  title: string;
  location: NonNullable<ExtensionViewContribution["location"]>;
  extensionId: string;
  extensionName: string;
  runtimeRegistered: boolean;
  runtimeStatus: "registered" | "waiting" | "error";
  runtimeMessage: string;
}

export const EXTENSION_VIEW_COMMAND_PREFIX = "extension:view:";

export function toExtensionViewCommandId(viewId: string) {
  return `${EXTENSION_VIEW_COMMAND_PREFIX}${viewId}` as const;
}

export function parseExtensionViewCommandId(commandId: string) {
  return commandId.startsWith(EXTENSION_VIEW_COMMAND_PREFIX)
    ? commandId.slice(EXTENSION_VIEW_COMMAND_PREFIX.length)
    : null;
}

export function getWorkbenchExtensionViews(
  extensionState: ExtensionState | null | undefined,
): WorkbenchExtensionView[] {
  const viewRecords =
    (extensionState?.contributionRegistry.views ??
      []) as ExtensionContributionRecord<ExtensionViewContribution>[];
  const runtimeByExtension = new Map(
    (extensionState?.runtimeRegistrations ?? []).map((registration) => [
      registration.extensionId,
      registration,
    ]),
  );

  // The renderer must treat the extension host as the source of truth for which
  // views exist, but it still needs a serializable workbench model. This helper
  // turns manifest/runtime contribution records into stable view descriptors
  // that the command palette, modal surface, and later sidebar/panel mounting
  // can all consume without each component repeating registry traversal.
  return viewRecords
    .map((record) => {
      const runtime = runtimeByExtension.get(record.extensionId);
      return {
        id: record.contribution.id,
        title: record.contribution.title,
        location: record.contribution.location ?? "sidebar",
        extensionId: record.extensionId,
        extensionName: record.extensionName,
        runtimeRegistered: runtime?.views.includes(record.contribution.id) ?? false,
        runtimeStatus: runtime?.status ?? "registered",
        runtimeMessage: runtime?.message ?? "Declarative view contribution.",
      } satisfies WorkbenchExtensionView;
    })
    .sort((left, right) => {
      return (
        left.location.localeCompare(right.location) ||
        left.extensionName.localeCompare(right.extensionName) ||
        left.title.localeCompare(right.title)
      );
    });
}
