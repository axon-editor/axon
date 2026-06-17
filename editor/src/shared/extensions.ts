import {
  type ThemeColorToken,
  type ThemeOverride,
} from "./settings";

export const AXON_EXTENSION_SCHEMA =
  "https://axoneditor.com/schemas/extension/v0.1.0.json";
export const AXON_THEME_SCHEMA =
  "https://axoneditor.com/schemas/theme/v0.1.0.json";

export type ExtensionSource = "workspace" | "user" | "internal";

export interface ExtensionManifest {
  $schema?: string;
  id: string;
  name: string;
  publisher: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  categories?: string[];
  activationEvents?: string[];
  contributes?: ExtensionContributions;
}

export interface ExtensionContributions {
  commands?: ExtensionCommandContribution[];
  themes?: ExtensionThemeContribution[];
  languages?: ExtensionLanguageContribution[];
  snippets?: ExtensionSnippetContribution[];
  icons?: ExtensionIconContribution[];
  views?: ExtensionViewContribution[];
  taskProviders?: ExtensionTaskProviderContribution[];
  debuggerProviders?: ExtensionDebuggerProviderContribution[];
  languagePacks?: ExtensionLanguagePackContribution[];
}

export interface ExtensionCommandContribution {
  id: string;
  title: string;
  category?: string;
  description?: string;
}

export interface ExtensionThemeContribution {
  id: string;
  label: string;
  path: string;
}

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

export interface ExtensionIconContribution {
  path: string;
}

export interface ExtensionViewContribution {
  id: string;
  title: string;
  location?: "sidebar" | "panel" | "modal";
  when?: string;
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
}

export interface ExtensionInfo {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
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
    mode: "declarative";
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
