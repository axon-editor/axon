import * as monaco from "monaco-editor";
import {
  THEME_LABELS,
  type AxonSettings,
  type BuiltInThemeId,
  type ThemeId,
} from "../../../shared/settings";
import { type ResolvedExtensionTheme } from "../../../shared/extensions";
import { axonDarkTheme } from "./axonDark";
import { ayuDarkTheme } from "./ayuDark";
import { catppuccinMochaTheme } from "./catppuccinMocha";
import { soraTheme } from "./sora";
import { zedDarkTheme } from "./zedDark";
import {
  createExtensionSyntaxRules,
  createSyntaxRules,
  type AxonThemeDefinition,
  type ThemeTokenMap,
} from "./types";

export const AXON_MONACO_THEME: BuiltInThemeId = "axon-dark";

type MonacoInstance = typeof monaco;

const registeredMonacos = new WeakSet<MonacoInstance>();

export const BUILT_IN_THEMES: Record<BuiltInThemeId, AxonThemeDefinition> = {
  "axon-dark": axonDarkTheme,
  sora: soraTheme,
  "zed-dark": zedDarkTheme,
  "catppuccin-mocha": catppuccinMochaTheme,
  "ayu-dark": ayuDarkTheme,
};

export function getThemeDefinition(themeId: ThemeId) {
  return BUILT_IN_THEMES[themeId as BuiltInThemeId] ?? BUILT_IN_THEMES["axon-dark"];
}

function getExtensionTheme(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  return extensionThemes.find((theme) => theme.id === themeId);
}

export function getThemeLabel(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  return getExtensionTheme(themeId, extensionThemes)?.label ??
    THEME_LABELS[themeId as BuiltInThemeId] ??
    themeId;
}

export function resolveThemeTokens(
  settings: AxonSettings,
  extensionThemes: ResolvedExtensionTheme[] = [],
): ThemeTokenMap {
  const extensionTheme = getExtensionTheme(settings.editor.themeId, extensionThemes);
  const theme = getThemeDefinition(settings.editor.themeId);
  const themeLabel = getThemeLabel(settings.editor.themeId, extensionThemes);
  const overrides =
    settings.theme_overrides[themeLabel] ??
    settings.theme_overrides[settings.editor.themeId] ??
    {};

  return {
    ...theme.tokens,
    ...(extensionTheme?.tokens ?? {}),
    ...overrides,
  };
}

function buildMonacoTheme(
  theme: AxonThemeDefinition,
  tokens: ThemeTokenMap = theme.tokens,
  extensionTheme?: ResolvedExtensionTheme,
) {
  return {
    base: theme.base,
    inherit: true,
    rules: [
      ...createSyntaxRules(tokens),
      ...(extensionTheme ? createExtensionSyntaxRules(extensionTheme.syntax) : []),
    ],
    colors: {
      foreground: tokens["editor.foreground"],
      "editor.background": tokens["editor.background"],
      "editor.foreground": tokens["editor.foreground"],
      "editorGutter.background": tokens["editor.gutter.background"],
      "input.foreground": tokens["editor.foreground"],
      "textLink.foreground": tokens["syntax.property"],
      "textPreformat.foreground": tokens["editor.foreground"],
      "terminal.background": tokens["terminal.background"],
      "terminal.foreground": tokens["terminal.foreground"],
      ...theme.monacoColors,
    },
  } satisfies monaco.editor.IStandaloneThemeData;
}

function defineAllThemes(
  monacoInstance: MonacoInstance,
  activeThemeId: ThemeId,
  activeTokens?: ThemeTokenMap,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  for (const theme of Object.values(BUILT_IN_THEMES)) {
    const tokens = theme.id === activeThemeId && activeTokens
      ? activeTokens
      : theme.tokens;
    monacoInstance.editor.defineTheme(theme.id, buildMonacoTheme(theme, tokens));
  }

  for (const extensionTheme of extensionThemes) {
    const baseTheme = extensionTheme.appearance === "light"
      ? BUILT_IN_THEMES["axon-dark"]
      : BUILT_IN_THEMES["axon-dark"];
    const tokens = extensionTheme.id === activeThemeId && activeTokens
      ? activeTokens
      : {
          ...baseTheme.tokens,
          ...extensionTheme.tokens,
        };
    try {
      // Extension themes come from local packages, and the first extension
      // host intentionally accepts Zed-compatible JSON. If a contributed
      // syntax scope or color shape hits a Monaco edge case, Axon should keep
      // running and simply skip that one contributed theme instead of letting
      // Reload Extensions crash the whole renderer.
      monacoInstance.editor.defineTheme(
        extensionTheme.id,
        buildMonacoTheme(baseTheme, tokens, extensionTheme),
      );
    } catch (err) {
      console.error(`failed to register extension theme ${extensionTheme.id}:`, err);
    }
  }
}

export function getMonacoThemeId(themeId: ThemeId) {
  return themeId;
}

export function registerAxonTheme(
  monacoInstance: MonacoInstance = monaco,
  themeId: ThemeId = AXON_MONACO_THEME,
  themeTokens?: ThemeTokenMap,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  // Every Monaco instance used by @monaco-editor/react must receive the same
  // theme definitions. The active theme can include live user overrides, while
  // inactive built-ins stay clean so switching themes never copies old override
  // values into the next theme.
  defineAllThemes(monacoInstance, themeId, themeTokens, extensionThemes);
  registeredMonacos.add(monacoInstance);
  try {
    monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
  } catch (err) {
    console.error(`failed to activate theme ${themeId}:`, err);
    monacoInstance.editor.setTheme(AXON_MONACO_THEME);
  }
}

export function hasRegisteredAxonThemes(monacoInstance: MonacoInstance = monaco) {
  return registeredMonacos.has(monacoInstance);
}
