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

const zedToAxonTokenMap: Partial<
  Record<ThemeColorToken, readonly string[]>
> = {
  background: ["background", "editor.background"],
  "status_bar.background": [
    "status_bar.background",
    "surface.background",
    "background",
  ],
  "title_bar.background": [
    "title_bar.background",
    "surface.background",
    "background",
  ],
  "toolbar.background": [
    "toolbar.background",
    "editor.background",
    "surface.background",
    "background",
  ],
  "sidebar.background": [
    "surface.background",
    "panel.background",
    "background",
  ],
  "sidebar.hover_background": [
    "element.hover",
    "ghost_element.hover",
    "surface.background",
    "background",
  ],
  "sidebar.border": ["border", "border.variant"],
  "tab.active_background": [
    "tab.active_background",
    "editor.background",
    "surface.background",
  ],
  "panel.background": [
    "panel.background",
    "surface.background",
    "background",
  ],
  "panel.border": ["border", "border.variant"],
  "panel.overlay_hover": [
    "element.hover",
    "ghost_element.hover",
    "surface.background",
    "background",
  ],
  "editor.foreground": ["editor.foreground", "text"],
  "editor.background": ["editor.background", "background"],
  "editor.gutter.background": [
    "editor.gutter.background",
    "editor.background",
    "background",
  ],
  "terminal.background": [
    "terminal.background",
    "editor.background",
    "background",
  ],
  "terminal.foreground": [
    "terminal.foreground",
    "editor.foreground",
    "text",
  ],
};

const zedToMonacoColorMap: Record<string, string> = {
  "border.focused": "focusBorder",
  "editor.active_line.background": "editor.lineHighlightBackground",
  "editor.active_line_number": "editorLineNumber.activeForeground",
  "editor.indent_guide": "editorIndentGuide.background1",
  "editor.indent_guide_active": "editorIndentGuide.activeBackground1",
  "editor.invisible": "editorWhitespace.foreground",
  "editor.line_number": "editorLineNumber.foreground",
  "scrollbar.thumb.background": "scrollbarSlider.background",
  "scrollbar.thumb.hover_background": "scrollbarSlider.hoverBackground",
  "search.match_background": "editor.findMatchBackground",
  selection: "editor.selectionBackground",
};

const zedSyntaxToAxonTokenMap: Record<string, ThemeColorToken> = {
  comment: "syntax.comment",
  keyword: "syntax.keyword",
  string: "syntax.string",
  number: "syntax.number",
  type: "syntax.type",
  function: "syntax.function",
  method: "syntax.method",
  "variable.member": "syntax.property",
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

function normalizeHexColor(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;

  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    return `#${Array.from(hex, (channel) => `${channel}${channel}`).join("")}`;
  }
  return `#${hex}`;
}

function normalizeFontStyle(value: unknown) {
  if (value === "italic" || value === "bold" || value === "underline") {
    return value;
  }
  return undefined;
}

function normalizeSyntaxStyle(value: unknown): ExtensionThemeSyntaxStyle | null {
  const directColor = normalizeHexColor(value);
  if (directColor) return { color: directColor };
  if (!isRecord(value)) return null;

  const style: ExtensionThemeSyntaxStyle = {};
  const color = normalizeHexColor(value.color);
  if (color) style.color = color;
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
    const color = normalizeHexColor(rawTheme.ui?.[token]);
    if (color) tokens[token] = color;
  }

  for (const [scope, value] of Object.entries(rawTheme.syntax ?? {})) {
    const style = normalizeSyntaxStyle(value);
    if (!style) continue;
    syntax[scope] = style;
    const mappedToken = zedSyntaxToAxonTokenMap[scope];
    if (mappedToken && style.color) tokens[mappedToken] = style.color;
  }

  for (const [key, value] of Object.entries(rawTheme.terminal ?? {})) {
    const color = normalizeHexColor(value);
    if (color) terminal[key] = color;
  }

  for (const [key, value] of Object.entries(rawTheme.monaco ?? {})) {
    const color = normalizeHexColor(value);
    if (color) monaco[key] = color;
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

  // Zed themes describe more surfaces than Axon currently exposes, and older
  // themes commonly leave the Axon-equivalent key null because Zed inherits it
  // from `surface.background`, `text`, or `border`. Resolving those authored
  // fallbacks here preserves the theme's hierarchy instead of allowing Axon's
  // generic completion logic to flatten the sidebar, panels, and editor into
  // unrelated default colors.
  for (const [axonToken, zedTokens] of Object.entries(zedToAxonTokenMap)) {
    for (const zedToken of zedTokens) {
      const color = normalizeHexColor(style[zedToken]);
      if (!color) continue;
      tokens[axonToken as ThemeColorToken] = color;
      break;
    }
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
    const color = normalizeHexColor(value);
    if (key.startsWith("terminal.ansi.") && color) {
      terminal[key.replace("terminal.", "")] = color;
    }

    const monacoKey = zedToMonacoColorMap[key];
    if (monacoKey && color) {
      monaco[monacoKey] = color;
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
