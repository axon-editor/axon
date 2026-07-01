import {
  type ThemeColorToken,
  type ThemeOverride,
} from "./settings";
import {
  type ExtensionActionResult as ApiExtensionActionResult,
  type ExtensionAuthor,
  type ExtensionCommandContribution,
  type ExtensionContributions,
  type ExtensionContributionRecord,
  type ExtensionContributionRegistry,
  type ExtensionDebuggerProviderContribution,
  type ExtensionIconThemeContribution,
  type ExtensionInfo as ApiExtensionInfo,
  type ExtensionKind,
  type ExtensionLanguageContribution,
  type ExtensionLanguagePackContribution,
  type ExtensionManifest,
  type ExtensionMarketplaceItem,
  type ExtensionMarketplaceState,
  type ExtensionRepository,
  type ExtensionSnippetContribution,
  type ExtensionSource,
  type ExtensionState as ApiExtensionState,
  type ExtensionTaskProviderContribution,
  type ExtensionTerminalProfileContribution,
  type ExtensionThemeContribution,
  type ExtensionThemeDefinition as ApiExtensionThemeDefinition,
  type ExtensionThemeSyntaxStyle,
  type ExtensionViewContribution,
  type ResolvedExtensionTheme as ApiResolvedExtensionTheme,
} from "@axon/extension-api";

export const AXON_EXTENSION_SCHEMA =
  "https://axoneditor.com/schemas/extension/v0.1.0.json";
export const AXON_THEME_SCHEMA =
  "https://axoneditor.com/schemas/theme/v0.1.0.json";

export type {
  ExtensionAuthor,
  ExtensionCommandContribution,
  ExtensionContributions,
  ExtensionContributionRecord,
  ExtensionContributionRegistry,
  ExtensionDebuggerProviderContribution,
  ExtensionIconThemeContribution,
  ExtensionKind,
  ExtensionLanguageContribution,
  ExtensionLanguagePackContribution,
  ExtensionManifest,
  ExtensionMarketplaceItem,
  ExtensionMarketplaceState,
  ExtensionRepository,
  ExtensionSnippetContribution,
  ExtensionSource,
  ExtensionTaskProviderContribution,
  ExtensionTerminalProfileContribution,
  ExtensionThemeContribution,
  ExtensionThemeSyntaxStyle,
  ExtensionViewContribution,
};

export type ExtensionIconContribution = ExtensionIconThemeContribution;

export interface ExtensionThemeDefinition
  extends Omit<ApiExtensionThemeDefinition, "ui"> {
  ui?: Partial<Record<ThemeColorToken | string, string | null>>;
}

export interface ResolvedExtensionTheme
  extends Omit<ApiResolvedExtensionTheme, "tokens"> {
  tokens: ThemeOverride;
}

export interface ExtensionInfo extends Omit<ApiExtensionInfo, "themes"> {
  themes: ResolvedExtensionTheme[];
}

export interface ExtensionState extends Omit<ApiExtensionState, "extensions"> {
  extensions: ExtensionInfo[];
}

export interface ExtensionActionResult
  extends Omit<ApiExtensionActionResult, "state"> {
  state: ExtensionState;
}
