export const AXON_EXTENSION_SCHEMA =
  "https://axoneditor.com/schemas/extension/v0.1.0.json";
export const AXON_THEME_SCHEMA =
  "https://axoneditor.com/schemas/theme/v0.1.0.json";

export type ExtensionKind =
  | "theme"
  | "icon-theme"
  | "language"
  | "tool"
  | "view"
  | "agent"
  | "terminal"
  | "mixed";

export type ExtensionActivationEvent =
  | "onStartup"
  | "onStartupFinished"
  | `onCommand:${string}`
  | `onLanguage:${string}`
  | `onView:${string}`
  | `onTaskType:${string}`
  | `onDebugType:${string}`
  | `onTerminalProfile:${string}`
  | `onAgent:${string}`
  | `onWorkspaceContains:${string}`;

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
  activationEvents?: ExtensionActivationEvent[];
  main?: string;
  contributes?: ExtensionContributions;
}

export interface ExtensionContributions {
  commands?: ExtensionCommandContribution[];
  themes?: ExtensionThemeContribution[];
  iconThemes?: ExtensionIconThemeContribution[];
  icons?: ExtensionIconThemeContribution[];
  languages?: ExtensionLanguageContribution[];
  snippets?: ExtensionSnippetContribution[];
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
  activationEvent?: `onTaskType:${string}`;
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
  ui?: Record<string, string | null>;
  syntax?: Record<string, ExtensionThemeSyntaxStyle | string | null>;
  terminal?: Record<string, string | null>;
  monaco?: Record<string, string | null>;
}
