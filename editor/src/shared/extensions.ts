import {
  type ThemeColorToken,
  type ThemeOverride,
} from "./settings";

// This file is a compatibility mirror of packages/extension-api for the current
// Electron app layout. The main-process TypeScript build emits from editor/src,
// so importing package source directly pulls files outside rootDir and breaks
// production builds. During the migration we keep the renderer IPC contract
// here, but new fields should stay aligned with packages/extension-api until
// Axon has a real workspace package build/link step.
export const AXON_EXTENSION_SCHEMA =
  "https://axoneditor.com/schemas/extension/v0.1.0.json";
export const AXON_THEME_SCHEMA =
  "https://axoneditor.com/schemas/theme/v0.1.0.json";

export type ExtensionSource = "workspace" | "user" | "internal";

export interface ExtensionRepository {
  type?: "git" | string;
  url: string;
}

export interface ExtensionAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface ExtensionManifest {
  $schema?: string;
  id: string;
  name: string;
  publisher: string;
  version: string;
  description?: string;
  repository?: string | ExtensionRepository;
  homepage?: string;
  kind?: ExtensionKind;
  author?: string | ExtensionAuthor;
  categories?: string[];
  activationEvents?: string[];
  main?: string;
  contributes?: ExtensionContributions;
}

export type ExtensionKind =
  | "theme"
  | "icon-theme"
  | "language"
  | "tool"
  | "view"
  | "agent"
  | "terminal"
  | "mixed";

export interface ExtensionContributions {
  commands?: ExtensionCommandContribution[];
  themes?: ExtensionThemeContribution[];
  iconThemes?: ExtensionIconThemeContribution[];
  languages?: ExtensionLanguageContribution[];
  snippets?: ExtensionSnippetContribution[];
  icons?: ExtensionIconThemeContribution[];
  views?: ExtensionViewContribution[];
  agents?: ExtensionAgentContribution[];
  terminalProfiles?: ExtensionTerminalProfileContribution[];
  taskProviders?: ExtensionTaskProviderContribution[];
  debuggerProviders?: ExtensionDebuggerProviderContribution[];
  languagePacks?: ExtensionLanguagePackContribution[];
}

export interface ExtensionCommandContribution {
  id: string;
  title: string;
  category?: string;
  description?: string;
  icon?: string | { light?: string; dark?: string };
}

export interface ExtensionThemeContribution {
  id: string;
  label: string;
  path: string;
}

export interface ExtensionIconThemeContribution {
  id?: string;
  label?: string;
  path: string;
}

export type ExtensionIconContribution = ExtensionIconThemeContribution;

export interface ExtensionLanguageContribution {
  id: string;
  label: string;
  extensions?: string[];
  filenames?: string[];
  aliases?: string[];
  configuration?: string;
}

export interface ExtensionSnippetContribution {
  language: string;
  path: string;
}

export interface ExtensionViewContribution {
  id: string;
  title: string;
  location?: "sidebar" | "panel" | "modal";
  when?: string;
}

export interface ExtensionAgentContribution {
  id: string;
  title: string;
  description?: string;
  view?: string;
  activationEvent?: `onAgent:${string}`;
}

export interface ExtensionTerminalProfileContribution {
  id: string;
  title: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExtensionTaskProviderContribution {
  type: string;
  label?: string;
  description?: string;
  activationEvent?: string;
}

export interface ExtensionDebuggerProviderContribution {
  type: string;
  label: string;
  languages?: string[];
  configurationAttributes?: Record<string, unknown>;
}

export interface ExtensionLanguagePackContribution {
  locale: string;
  label: string;
  path: string;
}

export interface ExtensionThemeSyntaxStyle {
  color?: string;
  fontStyle?: string;
  fontWeight?: number | string | null;
}

export interface ExtensionThemeDefinition {
  $schema?: string;
  id?: string;
  name: string;
  appearance?: "dark" | "light";
  ui?: Partial<Record<ThemeColorToken | string, string | null>>;
  syntax?: Record<string, ExtensionThemeSyntaxStyle | string | null>;
  terminal?: Record<string, string | null>;
  monaco?: Record<string, string | null>;
}

export interface ResolvedExtensionTheme {
  id: string;
  label: string;
  extensionId: string;
  extensionName: string;
  appearance: "dark" | "light";
  tokens: ThemeOverride;
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
