import { type ExtensionContributions, type ExtensionKind } from "./manifest";

export type ExtensionSource = "workspace" | "user" | "internal";

export interface ResolvedExtensionTheme {
  id: string;
  label: string;
  extensionId: string;
  extensionName: string;
  appearance: "dark" | "light";
  tokens: Record<string, string>;
  syntax: Record<string, { color?: string; fontStyle?: string }>;
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
  enabled: boolean;
  builtin: boolean;
  categories: string[];
  activationEvents: string[];
  contributes: Required<ExtensionContributions>;
  themes: ResolvedExtensionTheme[];
  errors: string[];
  active: boolean;
  activationReason: string;
  hostKind: "declarative" | "isolated-process";
  lifecycle: "active" | "inactive" | "disabled" | "error";
}

export interface ExtensionState {
  extensions: ExtensionInfo[];
  userExtensionsPath: string;
  workspaceExtensionsPath: string | null;
  hostStatus: {
    mode: "declarative" | "isolated-process";
    safeMode: boolean;
    message: string;
  };
  availableActivationEvents: string[];
}

export interface ExtensionActionResult {
  ok: boolean;
  message: string;
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
