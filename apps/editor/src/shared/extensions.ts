import {
  DEFAULT_THEME_ID,
  type ThemeColorToken,
  type ThemeOverride,
} from "./settings";
import {
  type ExtensionActionResult as ApiExtensionActionResult,
  type ExtensionAgentContribution,
  type ExtensionAuthor,
  type ExtensionCommandExecutionResult as ApiExtensionCommandExecutionResult,
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
  type ExtensionRuntimeRegistration,
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
  ExtensionAgentContribution,
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
  ExtensionRuntimeRegistration,
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

export function getEnabledExtensionThemes(
  state: Pick<ExtensionState, "extensions"> | null | undefined,
) {
  const themesById = new Map<string, ResolvedExtensionTheme>();

  // An extension can exist in bundled, workspace, and user sources at the same
  // time. Later sources are the effective override, but flattening every source
  // made Settings render the same theme ID repeatedly and allowed Monaco to
  // redefine it in a different order. Map replacement keeps one stable picker
  // position while ensuring the highest-precedence contribution is the value
  // consumed by the whole renderer.
  for (const extension of state?.extensions ?? []) {
    if (!extension.enabled) continue;
    for (const theme of extension.themes) {
      themesById.set(theme.id, theme);
    }
  }

  return [...themesById.values()];
}

export function resolveExtensionTheme(
  themes: readonly ResolvedExtensionTheme[],
  requestedThemeId: string,
) {
  // A theme ID is persisted longer than any individual extension version. The
  // selected contribution can therefore disappear after an extension is
  // removed, disabled, renamed, or when a newer development build has written
  // settings that an older installed build cannot provide. Axon Black is the
  // stable product fallback; the first loaded contribution is only a final
  // recovery path for a damaged installation where that built-in is missing.
  return (
    themes.find((theme) => theme.id === requestedThemeId) ??
    themes.find((theme) => theme.id === DEFAULT_THEME_ID) ??
    themes[0] ??
    null
  );
}

export interface ExtensionActionResult
  extends Omit<ApiExtensionActionResult, "state"> {
  state: ExtensionState;
}

export interface ExtensionCommandExecutionResult
  extends Omit<ApiExtensionCommandExecutionResult, "state"> {
  state: ExtensionState;
}
