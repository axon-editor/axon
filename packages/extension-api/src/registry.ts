import {
  type ExtensionContributions,
  type ExtensionKind,
  type ExtensionThemeSyntaxStyle,
} from "./manifest.js";

export type ExtensionSource = "workspace" | "user" | "internal";

export interface ResolvedExtensionTheme {
  id: string;
  label: string;
  extensionId: string;
  extensionName: string;
  appearance: "dark" | "light";
  tokens: Record<string, string>;
  syntax: Record<string, ExtensionThemeSyntaxStyle>;
  terminal: Record<string, string>;
  monaco: Record<string, string>;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  repositoryUrl: string | null;
  homepageUrl: string | null;
  kind: ExtensionKind;
  source: ExtensionSource;
  path: string;
  main: string | null;
  enabled: boolean;
  builtin: boolean;
  categories: string[];
  activationEvents: string[];
  contributes: Required<ExtensionContributions>;
  themes: ResolvedExtensionTheme[];
  errors: string[];
  active: boolean;
  activatedEvents: string[];
  lastActivatedAt: string | null;
  activationReason: string;
  hostKind: "declarative" | "isolated-process";
  lifecycle: "active" | "inactive" | "activating" | "disabled" | "failed";
}

export interface ExtensionActivationRecord {
  extensionId: string;
  event: string;
  reason: string;
  activatedAt: string;
  hostKind: "declarative" | "isolated-process";
  status: "activating" | "active" | "failed";
  error?: string;
}

export interface ExtensionRuntimeRegistration {
  extensionId: string;
  extensionName: string;
  hostKind: "declarative" | "isolated-process";
  commands: string[];
  views: string[];
  terminalProfiles: string[];
  agents: string[];
  debuggerProviders: string[];
  workspaceIndexProviders: string[];
  activatedEvents: string[];
  lastActivatedAt: string | null;
  status: "registered" | "waiting" | "activating" | "error";
  message: string;
}

export interface ExtensionState {
  extensions: ExtensionInfo[];
  contributionRegistry: ExtensionContributionRegistry;
  activationRecords: ExtensionActivationRecord[];
  runtimeRegistrations: ExtensionRuntimeRegistration[];
  userExtensionsPath: string;
  workspaceExtensionsPath: string | null;
  hostStatus: {
    mode: "declarative" | "isolated-process";
    safeMode: boolean;
    message: string;
  };
  availableActivationEvents: string[];
}

export interface ExtensionContributionRecord<T> {
  extensionId: string;
  extensionName: string;
  source: ExtensionSource;
  contribution: T;
}

type ContributionItem<T> = NonNullable<T> extends Array<infer Item> ? Item : never;

export interface ExtensionContributionRegistry {
  commands: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["commands"]>
  >[];
  themes: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["themes"]>
  >[];
  iconThemes: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["iconThemes"]>
  >[];
  languages: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["languages"]>
  >[];
  snippets: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["snippets"]>
  >[];
  views: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["views"]>
  >[];
  agents: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["agents"]>
  >[];
  terminalProfiles: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["terminalProfiles"]>
  >[];
  taskProviders: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["taskProviders"]>
  >[];
  debuggerProviders: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["debuggerProviders"]>
  >[];
  workspaceIndexProviders: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["workspaceIndexProviders"]>
  >[];
  languagePacks: ExtensionContributionRecord<
    ContributionItem<ExtensionContributions["languagePacks"]>
  >[];
}

export interface ExtensionActionResult {
  ok: boolean;
  message: string;
  state: ExtensionState;
}

export interface ExtensionCommandExecutionResult {
  ok: boolean;
  message: string;
  result?: unknown;
  state: ExtensionState;
}

export interface ExtensionMarketplaceTheme {
  id: string;
  label: string;
}

export interface ExtensionMarketplaceItem {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  repositoryUrl: string | null;
  homepageUrl: string | null;
  categories: string[];
  kind: ExtensionKind;
  themes: ExtensionMarketplaceTheme[];
  contributionLabels: string[];
  installed: boolean;
}

export interface ExtensionMarketplaceState {
  items: ExtensionMarketplaceItem[];
}
