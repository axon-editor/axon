import fs from "fs";
import {
  THEME_COLOR_TOKENS,
  type ThemeColorToken,
  type ThemeOverride,
} from "../../shared/settings";
import {
  type ExtensionThemeDefinition,
  type ExtensionThemeSyntaxStyle,
  type ResolvedExtensionTheme,
} from "../../shared/extensions";

const zedToAxonTokenMap: Record<string, ThemeColorToken> = {
  background: "background",
  "status_bar.background": "status_bar.background",
  "title_bar.background": "title_bar.background",
  "toolbar.background": "toolbar.background",
  "tab.active_background": "tab.active_background",
  "panel.background": "panel.background",
  "panel.border": "panel.border",
  "panel.overlay_hover": "panel.overlay_hover",
  "editor.foreground": "editor.foreground",
  "editor.background": "editor.background",
  "editor.gutter.background": "editor.gutter.background",
  "terminal.background": "terminal.background",
  "terminal.foreground": "terminal.foreground",
};

const zedSyntaxToAxonTokenMap: Record<string, ThemeColorToken> = {
  comment: "syntax.comment",
  keyword: "syntax.keyword",
  string: "syntax.string",
  number: "syntax.number",
  type: "syntax.type",
  function: "syntax.function",
  method: "syntax.method",
  "variable.member": "syntax.method",
  variable: "syntax.variable",
  "variable.special": "syntax.constant",
  property: "syntax.property",
  constant: "syntax.constant",
  operator: "syntax.operator",
  punctuation: "syntax.bracket",
  "punctuation.bracket": "syntax.bracket",
  attribute: "syntax.attribute",
  tag: "syntax.tag",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

function normalizeFontStyle(value: unknown) {
  if (value === "italic" || value === "bold" || value === "underline") {
    return value;
  }
  return undefined;
}

function normalizeSyntaxStyle(value: unknown): ExtensionThemeSyntaxStyle | null {
  if (isHexColor(value)) return { color: value };
  if (!isRecord(value)) return null;

  const style: ExtensionThemeSyntaxStyle = {};
  if (isHexColor(value.color)) style.color = value.color;
  const fontStyle = normalizeFontStyle(value.fontStyle ?? value.font_style);
  if (fontStyle) style.fontStyle = fontStyle;
  const fontWeight = value.fontWeight ?? value.font_weight;
  if (typeof fontWeight === "number" || typeof fontWeight === "string") {
    style.fontWeight = fontWeight;
  }

  return Object.keys(style).length > 0 ? style : null;
}

function normalizeAxonTheme(
  extensionId: string,
  extensionName: string,
  contributionId: string,
  contributionLabel: string,
  rawTheme: ExtensionThemeDefinition,
): ResolvedExtensionTheme {
  const tokens: ThemeOverride = {};
  const syntax: Record<string, ExtensionThemeSyntaxStyle> = {};
  const terminal: Record<string, string> = {};
  const monaco: Record<string, string> = {};

  for (const token of THEME_COLOR_TOKENS) {
    const color = rawTheme.ui?.[token];
    if (isHexColor(color)) tokens[token] = color;
  }

  for (const [scope, value] of Object.entries(rawTheme.syntax ?? {})) {
    const style = normalizeSyntaxStyle(value);
    if (!style) continue;
    syntax[scope] = style;
    const mappedToken = zedSyntaxToAxonTokenMap[scope];
    if (mappedToken && style.color) tokens[mappedToken] = style.color;
  }

  for (const [key, value] of Object.entries(rawTheme.terminal ?? {})) {
    if (isHexColor(value)) terminal[key] = value;
  }

  for (const [key, value] of Object.entries(rawTheme.monaco ?? {})) {
    if (isHexColor(value)) monaco[key] = value;
  }

  return {
    id: rawTheme.id ?? contributionId,
    label: rawTheme.name ?? contributionLabel,
    extensionId,
    extensionName,
    appearance: rawTheme.appearance === "light" ? "light" : "dark",
    tokens,
    syntax,
    terminal,
    monaco,
  };
}

function normalizeZedTheme(
  extensionId: string,
  extensionName: string,
  contributionId: string,
  contributionLabel: string,
  rawTheme: Record<string, unknown>,
  resolvedThemeId = contributionId,
): ResolvedExtensionTheme {
  const style = isRecord(rawTheme.style) ? rawTheme.style : {};
  const syntaxStyle = isRecord(style.syntax) ? style.syntax : {};
  const tokens: ThemeOverride = {};
  const syntax: Record<string, ExtensionThemeSyntaxStyle> = {};
  const terminal: Record<string, string> = {};
  const monaco: Record<string, string> = {};

  for (const [zedToken, axonToken] of Object.entries(zedToAxonTokenMap)) {
    const color = style[zedToken];
    if (isHexColor(color)) tokens[axonToken] = color;
  }

  for (const [scope, value] of Object.entries(syntaxStyle)) {
    const normalizedStyle = normalizeSyntaxStyle(value);
    if (!normalizedStyle) continue;
    syntax[scope] = normalizedStyle;
    const mappedToken = zedSyntaxToAxonTokenMap[scope];
    if (mappedToken && normalizedStyle.color) {
      tokens[mappedToken] = normalizedStyle.color;
    }
  }

  for (const [key, value] of Object.entries(style)) {
    if (key.startsWith("terminal.ansi.") && isHexColor(value)) {
      terminal[key.replace("terminal.", "")] = value;
    }
  }

  return {
    id: resolvedThemeId,
    label:
      typeof rawTheme.name === "string" && rawTheme.name.trim()
        ? rawTheme.name
        : contributionLabel,
    extensionId,
    extensionName,
    appearance: rawTheme.appearance === "light" ? "light" : "dark",
    tokens,
    syntax,
    terminal,
    monaco,
  };
}

export function readExtensionTheme(
  extensionId: string,
  extensionName: string,
  contributionId: string,
  contributionLabel: string,
  themePath: string,
): ResolvedExtensionTheme[] {
  const raw = JSON.parse(fs.readFileSync(themePath, "utf-8")) as unknown;

  // Zed packages can contain a theme collection with a `themes` array. Axon
  // normalizes that shape instead of forcing users to manually rewrite every
  // syntax scope before they can try a theme. Native Axon themes still use the
  // smaller `ui/syntax/terminal` shape because that is easier to author by hand.
  if (isRecord(raw) && Array.isArray(raw.themes)) {
    const zedThemes = raw.themes.filter(isRecord);
    return raw.themes
      .filter(isRecord)
      .map((theme, index) =>
        normalizeZedTheme(
          extensionId,
          extensionName,
          contributionId,
          contributionLabel,
          theme,
          zedThemes.length === 1 ? contributionId : `${contributionId}-${index + 1}`,
        ),
      );
  }

  if (!isRecord(raw)) return [];
  return [
    normalizeAxonTheme(
      extensionId,
      extensionName,
      contributionId,
      contributionLabel,
      raw as unknown as ExtensionThemeDefinition,
    ),
  ];
}
