import { AXON_COMMANDS, type AxonCommand } from "../../../../shared/commands";
import {
  type ExtensionCommandContribution,
  type ExtensionContributionRecord,
  type ExtensionState,
  type ExtensionViewContribution,
} from "../../../../shared/extensions";

interface RequiredWorkbenchContribution {
  extensionId: string;
  views?: Array<{
    id: string;
    location: NonNullable<ExtensionViewContribution["location"]>;
  }>;
  commands?: string[];
}

export const BUILTIN_CONTRIBUTED_COMMAND_ALIASES: Record<string, AxonCommand> = {
  "axon.agent.fixProblems": AXON_COMMANDS.AI_FIX_PROBLEM,
  "axon.agent.open": AXON_COMMANDS.ASK_AXON,
  "axon.git.openHistory": AXON_COMMANDS.OPEN_GIT_HISTORY,
  "axon.git.openSourceControl": AXON_COMMANDS.OPEN_SOURCE_CONTROL,
  "axon.git.refresh": AXON_COMMANDS.OPEN_SOURCE_CONTROL,
  "axon.preview.openHtml": AXON_COMMANDS.OPEN_HTML_PREVIEW,
  "axon.problems.open": AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
  "axon.problems.refresh": AXON_COMMANDS.REFRESH_DIAGNOSTICS,
  "axon.search.openWorkspace": AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
  "axon.settings.open": AXON_COMMANDS.OPEN_SETTINGS,
  "axon.settings.openJson": AXON_COMMANDS.OPEN_SETTINGS_JSON,
  "axon.terminal.new": AXON_COMMANDS.NEW_TERMINAL,
  "axon.terminal.toggle": AXON_COMMANDS.TOGGLE_TERMINAL,
  "axon.testing.open": AXON_COMMANDS.OPEN_TEST_EXPLORER,
  "axon.testing.refresh": AXON_COMMANDS.OPEN_TEST_EXPLORER,
};

export const BUILTIN_CONTRIBUTED_VIEW_ALIASES: Record<string, AxonCommand> = {
  "axon.agent": AXON_COMMANDS.ASK_AXON,
  "axon.history": AXON_COMMANDS.OPEN_GIT_HISTORY,
  "axon.problems": AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
  "axon.search.workspace": AXON_COMMANDS.OPEN_WORKSPACE_SEARCH,
  "axon.settings": AXON_COMMANDS.OPEN_SETTINGS,
  "axon.sourceControl": AXON_COMMANDS.OPEN_SOURCE_CONTROL,
  "axon.terminal": AXON_COMMANDS.TOGGLE_TERMINAL,
  "axon.tests": AXON_COMMANDS.OPEN_TEST_EXPLORER,
};

export const BUILTIN_WORKBENCH_CONTRIBUTIONS = {
  agent: {
    extensionId: "axon.agent",
    views: [{ id: "axon.agent", location: "sidebar" }],
    commands: ["axon.agent.open", "axon.agent.fixProblems"],
  },
  git: {
    extensionId: "axon.git",
    views: [
      { id: "axon.sourceControl", location: "sidebar" },
      { id: "axon.history", location: "sidebar" },
    ],
    commands: [
      "axon.git.openSourceControl",
      "axon.git.openHistory",
      "axon.git.refresh",
    ],
  },
  search: {
    extensionId: "axon.search",
    views: [{ id: "axon.search.workspace", location: "modal" }],
    commands: ["axon.search.openWorkspace"],
  },
  htmlPreview: {
    extensionId: "axon.htmlPreview",
    commands: ["axon.preview.openHtml"],
  },
  settings: {
    extensionId: "axon.settings",
    views: [{ id: "axon.settings", location: "modal" }],
    commands: ["axon.settings.open", "axon.settings.openJson"],
  },
  terminal: {
    extensionId: "axon.terminal",
    views: [{ id: "axon.terminal", location: "panel" }],
    commands: ["axon.terminal.new", "axon.terminal.toggle"],
  },
  testing: {
    extensionId: "axon.testing",
    views: [{ id: "axon.tests", location: "sidebar" }],
    commands: ["axon.testing.open", "axon.testing.refresh"],
  },
} as const satisfies Record<string, RequiredWorkbenchContribution>;

export interface ResolvedWorkbenchContribution {
  extensionId: string;
  extensionName: string;
  views: Record<string, ExtensionViewContribution>;
  commands: Record<string, ExtensionCommandContribution>;
}

function getContributionRecords(extensionState: ExtensionState | null | undefined) {
  const registry = extensionState?.contributionRegistry;
  if (!registry) return null;

  return {
    views: registry.views as ExtensionContributionRecord<ExtensionViewContribution>[],
    commands:
      registry.commands as ExtensionContributionRecord<ExtensionCommandContribution>[],
  };
}

export function resolveRequiredWorkbenchContribution(
  extensionState: ExtensionState | null | undefined,
  required: RequiredWorkbenchContribution,
): ResolvedWorkbenchContribution | null {
  const records = getContributionRecords(extensionState);
  if (!records) return null;

  const views: Record<string, ExtensionViewContribution> = {};
  const commands: Record<string, ExtensionCommandContribution> = {};
  let extensionName = required.extensionId;

  for (const view of required.views ?? []) {
    const record = records.views.find(
      (candidate) =>
        candidate.extensionId === required.extensionId &&
        candidate.contribution.id === view.id &&
        candidate.contribution.location === view.location,
    );
    if (!record) return null;
    extensionName = record.extensionName;
    views[view.id] = record.contribution;
  }

  for (const commandId of required.commands ?? []) {
    const record = records.commands.find(
      (candidate) =>
        candidate.extensionId === required.extensionId &&
        candidate.contribution.id === commandId,
    );
    if (!record) return null;
    extensionName = record.extensionName;
    commands[commandId] = record.contribution;
  }

  // Built-in workbench surfaces are still mounted by React, but this resolver
  // forces every mount to prove the extension manifest contributed the required
  // commands and views first. That gives the migration one registry contract
  // for first-party and future third-party packages instead of allowing direct
  // imports to bypass extension enablement, activation, or manifest regressions.
  return {
    extensionId: required.extensionId,
    extensionName,
    views,
    commands,
  };
}

export function getBuiltinCommandAlias(commandId: string) {
  return BUILTIN_CONTRIBUTED_COMMAND_ALIASES[commandId] ?? null;
}

export function getBuiltinViewAlias(viewId: string) {
  return BUILTIN_CONTRIBUTED_VIEW_ALIASES[viewId] ?? null;
}
