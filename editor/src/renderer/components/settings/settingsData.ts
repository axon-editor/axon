import {
  AI_PROVIDER_IDS,
  BUILT_IN_THEME_IDS,
  EDITOR_FONT_FAMILIES,
  FONT_PRESET_IDS,
  THEME_COLOR_TOKENS,
  THEME_LABELS,
  UI_FONT_FAMILIES,
  type AiProviderId,
  type BuiltInThemeId,
  type EditorFontFamily,
  type FontPresetId,
  type ThemeColorToken,
  type UiFontFamily,
} from "../../../shared/settings";
import { type SearchSelectItem } from "../SearchSelect";

export type SettingsSectionId =
  | "appearance"
  | "editor"
  | "syntaxColors"
  | "fonts"
  | "languageServers"
  | "theme"
  | "ai";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and UI font",
  },
  {
    id: "editor",
    label: "Editor",
    description: "Text, spacing, and ligatures",
  },
  {
    id: "syntaxColors",
    label: "Syntax Colors",
    description: "Code token colors",
  },
  {
    id: "languageServers",
    label: "Language Servers",
    description: "Project-aware editor services",
  },
  {
    id: "theme",
    label: "Theme Overrides",
    description: "Surface color overrides",
  },
  {
    id: "fonts",
    label: "Fonts",
    description: "Import and apply custom fonts",
  },
  {
    id: "ai",
    label: "AI",
    description: "Provider defaults for later",
  },
];

export const THEME_ITEMS: SearchSelectItem<BuiltInThemeId>[] =
  BUILT_IN_THEME_IDS.map((themeId) => ({
    value: themeId,
    label: THEME_LABELS[themeId],
  }));

export const UI_FONT_ITEMS: SearchSelectItem<UiFontFamily>[] =
  UI_FONT_FAMILIES.map((fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
  }));

export const EDITOR_FONT_ITEMS: SearchSelectItem<EditorFontFamily>[] =
  EDITOR_FONT_FAMILIES.map((fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
  }));

const FONT_PRESET_LABELS: Record<FontPresetId, string> = {
  "axon-default": "Axon default",
  "zed-like": "Zed-like",
  "jetbrains-mono": "JetBrains Mono",
  "sf-mono": "SF Mono",
  "fira-code": "Fira Code",
  "geist-mono": "Geist Mono",
  "cascadia-code": "Cascadia Code",
  "berkeley-mono": "Berkeley Mono",
};

export const FONT_PRESET_ITEMS: SearchSelectItem<FontPresetId>[] =
  FONT_PRESET_IDS.map((presetId) => ({
    value: presetId,
    label: FONT_PRESET_LABELS[presetId],
  }));

const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: "OpenAI",
  local: "Local",
};

export const AI_PROVIDER_ITEMS: SearchSelectItem<AiProviderId>[] =
  AI_PROVIDER_IDS.map((provider) => ({
    value: provider,
    label: AI_PROVIDER_LABELS[provider],
  }));

export const THEME_COLOR_LABELS: Record<ThemeColorToken, string> = {
  background: "App background",
  "status_bar.background": "Status bar",
  "title_bar.background": "Title bar",
  "toolbar.background": "Toolbar",
  "sidebar.background": "Sidebar",
  "sidebar.border": "Sidebar border",
  "tab.active_background": "Active tab",
  "panel.background": "Panel",
  "panel.border": "Panel border",
  "panel.overlay_hover": "Panel hover",
  "editor.foreground": "Editor text",
  "editor.background": "Editor background",
  "editor.gutter.background": "Editor gutter",
  "terminal.background": "Terminal background",
  "terminal.foreground": "Terminal text",
  "syntax.comment": "Syntax comment",
  "syntax.keyword": "Syntax keyword",
  "syntax.string": "Syntax string",
  "syntax.number": "Syntax number",
  "syntax.type": "Syntax type",
  "syntax.function": "Syntax function",
  "syntax.method": "Syntax method",
  "syntax.class": "Syntax class",
  "syntax.interface": "Syntax interface",
  "syntax.variable": "Syntax variable",
  "syntax.parameter": "Syntax parameter",
  "syntax.property": "Syntax property",
  "syntax.constant": "Syntax constant",
  "syntax.operator": "Syntax operator",
  "syntax.bracket": "Syntax bracket",
  "syntax.import": "Syntax import",
  "syntax.tag": "Syntax tag",
  "syntax.attribute": "Syntax attribute",
};

export const UI_THEME_COLOR_TOKENS = THEME_COLOR_TOKENS.filter(
  (token) => !token.startsWith("syntax."),
);

export const SYNTAX_THEME_COLOR_TOKENS = THEME_COLOR_TOKENS.filter((token) =>
  token.startsWith("syntax."),
);

export { THEME_COLOR_TOKENS, THEME_LABELS };
