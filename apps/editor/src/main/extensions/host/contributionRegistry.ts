import {
  emptyExtensionContributions,
  type ExtensionContributionRegistry,
  type ExtensionInfo,
} from "@axon/extension-api";

function pushContributions<
  Key extends keyof ExtensionContributionRegistry,
  Contribution,
>(
  registry: ExtensionContributionRegistry,
  key: Key,
  extension: ExtensionInfo,
  contributions: Contribution[],
) {
  const target = registry[key] as Array<{
    extensionId: string;
    extensionName: string;
    source: ExtensionInfo["source"];
    contribution: Contribution;
  }>;

  for (const contribution of contributions) {
    target.push({
      extensionId: extension.id,
      extensionName: extension.name,
      source: extension.source,
      contribution,
    });
  }
}

export function createExtensionContributionRegistry(
  extensions: ExtensionInfo[],
): ExtensionContributionRegistry {
  const empty = emptyExtensionContributions();
  const registry: ExtensionContributionRegistry = {
    commands: [],
    themes: [],
    iconThemes: [],
    languages: [],
    snippets: [],
    views: [],
    agents: [],
    terminalProfiles: [],
    taskProviders: [],
    debuggerProviders: [],
    workspaceIndexProviders: [],
    languagePacks: [],
  };

  // The registry is built from enabled, non-failed extensions because
  // activation starts from declarative contributions. An executable extension
  // can be "inactive" before its main file has run, but its contributed command
  // still needs to appear so the command can trigger `onCommand:*` activation.
  // Disabled or failed packages still appear in the Extensions modal for
  // diagnosis, but their commands, terminal profiles, views, and languages must
  // not leak into active editor UI.
  for (const extension of extensions) {
    if (
      !extension.enabled ||
      extension.lifecycle === "disabled" ||
      extension.lifecycle === "failed"
    ) {
      continue;
    }
    if (extension.id === "axon.builtin") continue;

    const contributes = extension.contributes ?? empty;
    pushContributions(registry, "commands", extension, contributes.commands);
    pushContributions(registry, "themes", extension, contributes.themes);
    pushContributions(registry, "iconThemes", extension, [
      ...contributes.iconThemes,
      ...contributes.icons,
    ]);
    pushContributions(registry, "languages", extension, contributes.languages);
    pushContributions(registry, "snippets", extension, contributes.snippets);
    pushContributions(registry, "views", extension, contributes.views);
    pushContributions(registry, "agents", extension, contributes.agents);
    pushContributions(
      registry,
      "terminalProfiles",
      extension,
      contributes.terminalProfiles,
    );
    pushContributions(
      registry,
      "taskProviders",
      extension,
      contributes.taskProviders,
    );
    pushContributions(
      registry,
      "debuggerProviders",
      extension,
      contributes.debuggerProviders,
    );
    pushContributions(
      registry,
      "workspaceIndexProviders",
      extension,
      contributes.workspaceIndexProviders,
    );
    pushContributions(
      registry,
      "languagePacks",
      extension,
      contributes.languagePacks,
    );
  }

  return registry;
}
