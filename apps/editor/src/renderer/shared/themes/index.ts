import * as monaco from "monaco-editor";
import {
  THEME_COLOR_TOKENS,
  type AxonSettings,
  type ThemeColorToken,
  type ThemeId,
} from "../../../shared/settings";
import { type ResolvedExtensionTheme } from "../../../shared/extensions";
import {
  createSemanticTokenColors,
  createSemanticTokenRules,
  createSyntaxRules,
  type AxonThemeDefinition,
  type ThemeTokenMap,
} from "./types";

export type { ThemeTokenMap } from "./types";

export const AXON_MONACO_THEME = "axon-dark";

type MonacoInstance = typeof monaco;

const registeredMonacos = new WeakSet<MonacoInstance>();

function getExtensionTheme(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  return extensionThemes.find((theme) => theme.id === themeId);
}

function getRequiredTheme(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[],
) {
  const selectedTheme = getExtensionTheme(themeId, extensionThemes);
  if (selectedTheme) return selectedTheme;

  throw new Error(
    `Theme registry is not ready. Missing selected extension theme "${themeId}".`,
  );
}

export function getThemeLabel(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  return getExtensionTheme(themeId, extensionThemes)?.label ?? themeId;
}

function firstThemeColor(
  extensionTheme: ResolvedExtensionTheme,
  keys: ThemeColorToken[],
  fallback = "#0d1016",
) {
  for (const key of keys) {
    const value = extensionTheme.tokens[key];
    if (value) return value;
  }
  return fallback;
}

function completeThemeTokens(extensionTheme: ResolvedExtensionTheme): ThemeTokenMap {
  const editorBackground = firstThemeColor(extensionTheme, [
    "editor.background",
    "background",
    "terminal.background",
  ]);
  const foreground = firstThemeColor(
    extensionTheme,
    ["editor.foreground", "terminal.foreground"],
    "#d8dee9",
  );
  const panelBackground = firstThemeColor(
    extensionTheme,
    ["panel.background", "sidebar.background", "background"],
    editorBackground,
  );
  const panelBorder = firstThemeColor(
    extensionTheme,
    ["panel.border", "sidebar.border", "panel.overlay_hover"],
    panelBackground,
  );
  const syntaxForeground = {
    "syntax.comment": "#6f7682",
    "syntax.keyword": foreground,
    "syntax.string": foreground,
    "syntax.number": foreground,
    "syntax.type": foreground,
    "syntax.function": foreground,
    "syntax.method": foreground,
    "syntax.class": foreground,
    "syntax.interface": foreground,
    "syntax.variable": foreground,
    "syntax.parameter": foreground,
    "syntax.property": foreground,
    "syntax.constant": foreground,
    "syntax.operator": foreground,
    "syntax.bracket": foreground,
    "syntax.import": foreground,
    "syntax.tag": foreground,
    "syntax.attribute": foreground,
  } satisfies Partial<ThemeTokenMap>;

  const completed = {
    background: extensionTheme.tokens.background ?? editorBackground,
    "status_bar.background":
      extensionTheme.tokens["status_bar.background"] ?? panelBackground,
    "title_bar.background":
      extensionTheme.tokens["title_bar.background"] ?? panelBackground,
    "toolbar.background":
      extensionTheme.tokens["toolbar.background"] ?? panelBackground,
    "sidebar.background":
      extensionTheme.tokens["sidebar.background"] ?? panelBackground,
    "sidebar.hover_background":
      extensionTheme.tokens["sidebar.hover_background"] ??
      extensionTheme.tokens["panel.overlay_hover"] ??
      panelBorder,
    "sidebar.border": extensionTheme.tokens["sidebar.border"] ?? panelBorder,
    "tab.active_background":
      extensionTheme.tokens["tab.active_background"] ?? editorBackground,
    "panel.background":
      extensionTheme.tokens["panel.background"] ?? panelBackground,
    "panel.border": extensionTheme.tokens["panel.border"] ?? panelBorder,
    "panel.overlay_hover":
      extensionTheme.tokens["panel.overlay_hover"] ?? panelBorder,
    "editor.foreground":
      extensionTheme.tokens["editor.foreground"] ?? foreground,
    "editor.background":
      extensionTheme.tokens["editor.background"] ?? editorBackground,
    "editor.gutter.background":
      extensionTheme.tokens["editor.gutter.background"] ?? editorBackground,
    "terminal.background":
      extensionTheme.tokens["terminal.background"] ?? editorBackground,
    "terminal.foreground":
      extensionTheme.tokens["terminal.foreground"] ?? foreground,
    ...syntaxForeground,
    ...extensionTheme.tokens,
  } satisfies Partial<ThemeTokenMap>;

  for (const token of THEME_COLOR_TOKENS) {
    if (!completed[token]) {
      throw new Error(
        `Theme "${extensionTheme.id}" is missing required token "${token}".`,
      );
    }
  }

  return completed as ThemeTokenMap;
}

export function resolveThemeTokens(
  settings: AxonSettings,
  extensionThemes: ResolvedExtensionTheme[] = [],
): ThemeTokenMap {
  const extensionTheme = getRequiredTheme(settings.editor.themeId, extensionThemes);

  // Theme colors are now owned by extension packages. Keeping runtime override
  // layering here would make the same built-in theme render differently from
  // its JSON contribution, which is exactly the drift the extension-host
  // migration is meant to remove.
  return completeThemeTokens(extensionTheme);
}

function buildMonacoTheme(
  theme: AxonThemeDefinition,
  tokens: ThemeTokenMap = theme.tokens,
  extensionTheme?: ResolvedExtensionTheme,
) {
  const themeData: monaco.editor.IStandaloneThemeData = {
    base: theme.base,
    inherit: true,
    rules: [
      ...createSyntaxRules(tokens, extensionTheme?.syntax),
      // Monaco standalone resolves semantic token styling through the same
      // token theme matcher used for normal syntax rules. Keeping the
      // semanticTokenColors object below is useful for VS Code-compatible theme
      // data, but standalone painting calls getTokenStyleMetadata(), which
      // matches selectors such as "function.declaration" against `rules`.
      // Without these mirrored rules, Axon can receive perfect LSP/TextMate
      // semantic tokens and still render them with the default foreground.
      ...createSemanticTokenRules(tokens, extensionTheme?.syntax),
      ...(theme.tokenRules ?? []),
    ],
    colors: {
      foreground: tokens["editor.foreground"],
      "editor.background": tokens["editor.background"],
      "editor.foreground": tokens["editor.foreground"],
      "editorGutter.background": tokens["editor.gutter.background"],
      "editorBracketHighlight.foreground1": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground2": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground3": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground4": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground5": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground6": tokens["syntax.bracket"],
      "editorBracketHighlight.unexpectedBracket.foreground":
        tokens["syntax.constant"],
      "input.foreground": tokens["editor.foreground"],
      "textLink.foreground": tokens["syntax.property"],
      "textPreformat.foreground": tokens["editor.foreground"],
      "terminal.background": tokens["terminal.background"],
      "terminal.foreground": tokens["terminal.foreground"],
      ...theme.monacoColors,
      ...(extensionTheme?.monaco ?? {}),
    },
  };

  // Monaco consumes semanticTokenColors at runtime, but the bundled type in
  // this version does not expose that field. Keep the theme object strict and
  // attach the runtime field through a narrow extension instead of weakening
  // the full theme builder with any.
  (
    themeData as monaco.editor.IStandaloneThemeData & {
      semanticHighlighting: boolean;
      semanticTokenColors: Record<string, unknown>;
    }
  ).semanticHighlighting = true;
  (
    themeData as monaco.editor.IStandaloneThemeData & {
      semanticTokenColors: Record<string, unknown>;
    }
  ).semanticTokenColors = {
    ...createSemanticTokenColors(tokens, extensionTheme?.syntax),
    ...(theme.semanticTokenColors ?? {}),
  };

  return themeData;
}

function defineAllThemes(
  monacoInstance: MonacoInstance,
  activeThemeId: ThemeId,
  activeTokens?: ThemeTokenMap,
  extensionThemes: ResolvedExtensionTheme[] = [],
  activeSyntax: ResolvedExtensionTheme["syntax"] = {},
) {
  if (extensionThemes.length === 0 && activeTokens) {
    const themeDefinition: AxonThemeDefinition = {
      id: activeThemeId,
      label: activeThemeId,
      base: "vs-dark",
      tokens: activeTokens,
      monacoColors: {},
      syntax: activeSyntax,
    };
    monacoInstance.editor.defineTheme(
      activeThemeId,
      buildMonacoTheme(themeDefinition, activeTokens, {
        id: activeThemeId,
        label: activeThemeId,
        extensionId: "axon.runtime-theme",
        extensionName: "Axon Runtime Theme",
        appearance: "dark",
        tokens: activeTokens,
        syntax: activeSyntax,
        terminal: {},
        monaco: {},
      }),
    );
    return;
  }

  for (const extensionTheme of extensionThemes) {
    const tokens = extensionTheme.id === activeThemeId && activeTokens
      ? activeTokens
      : completeThemeTokens(extensionTheme);
    const themeDefinition: AxonThemeDefinition = {
      id: extensionTheme.id,
      label: extensionTheme.label,
      base: extensionTheme.appearance === "light" ? "vs" : "vs-dark",
      tokens,
      monacoColors: extensionTheme.monaco,
    };
    try {
      // Extension themes come from local packages, and the first extension
      // host intentionally accepts Zed-compatible JSON. If a contributed
      // syntax scope or color shape hits a Monaco edge case, Axon should keep
      // running and simply skip that one contributed theme instead of letting
      // Reload Extensions crash the whole renderer.
      monacoInstance.editor.defineTheme(
        extensionTheme.id,
        buildMonacoTheme(themeDefinition, tokens, extensionTheme),
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
  activeSyntax: ResolvedExtensionTheme["syntax"] = {},
) {
  // Every Monaco instance used by @monaco-editor/react must receive the same
  // extension-provided theme definitions. The renderer no longer has a private
  // TypeScript fallback registry, so a missing definition should surface as a
  // real extension-loading problem instead of being hidden by another source.
  defineAllThemes(
    monacoInstance,
    themeId,
    themeTokens,
    extensionThemes,
    activeSyntax,
  );
  registeredMonacos.add(monacoInstance);
  try {
    monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
  } catch (err) {
    console.error(`failed to activate theme ${themeId}:`, err);
  }
}

export function hasRegisteredAxonThemes(monacoInstance: MonacoInstance = monaco) {
  return registeredMonacos.has(monacoInstance);
}
