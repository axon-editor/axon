import * as monaco from "monaco-editor";
import {
  THEME_LABELS,
  type AxonSettings,
  type BuiltInThemeId,
} from "../../../shared/settings";
import { axonDarkTheme } from "./axonDark";
import { ayuDarkTheme } from "./ayuDark";
import { catppuccinMochaTheme } from "./catppuccinMocha";
import { soraTheme } from "./sora";
import { zedDarkTheme } from "./zedDark";
import {
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

export function getThemeDefinition(themeId: BuiltInThemeId) {
  return BUILT_IN_THEMES[themeId] ?? BUILT_IN_THEMES["axon-dark"];
}

export function resolveThemeTokens(settings: AxonSettings): ThemeTokenMap {
  const theme = getThemeDefinition(settings.editor.themeId);
  const themeLabel = THEME_LABELS[settings.editor.themeId];
  const overrides =
    settings.theme_overrides[themeLabel] ??
    settings.theme_overrides[settings.editor.themeId] ??
    {};

  return {
    ...theme.tokens,
    ...overrides,
  };
}

function buildMonacoTheme(
  theme: AxonThemeDefinition,
  tokens: ThemeTokenMap = theme.tokens,
) {
  return {
    base: theme.base,
    inherit: true,
    rules: createSyntaxRules(tokens),
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
  activeThemeId: BuiltInThemeId,
  activeTokens?: ThemeTokenMap,
) {
  for (const theme of Object.values(BUILT_IN_THEMES)) {
    const tokens = theme.id === activeThemeId && activeTokens
      ? activeTokens
      : theme.tokens;
    monacoInstance.editor.defineTheme(theme.id, buildMonacoTheme(theme, tokens));
  }
}

export function getMonacoThemeId(themeId: BuiltInThemeId) {
  return themeId;
}

export function registerAxonTheme(
  monacoInstance: MonacoInstance = monaco,
  themeId: BuiltInThemeId = AXON_MONACO_THEME,
  themeTokens?: ThemeTokenMap,
) {
  // Every Monaco instance used by @monaco-editor/react must receive the same
  // theme definitions. The active theme can include live user overrides, while
  // inactive built-ins stay clean so switching themes never copies old override
  // values into the next theme.
  defineAllThemes(monacoInstance, themeId, themeTokens);
  registeredMonacos.add(monacoInstance);
  monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
}

export function hasRegisteredAxonThemes(monacoInstance: MonacoInstance = monaco) {
  return registeredMonacos.has(monacoInstance);
}
