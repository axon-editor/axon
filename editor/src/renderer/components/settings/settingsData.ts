import {
  AI_PROVIDER_IDS,
  BUILT_IN_THEME_IDS,
  EDITOR_FONT_FAMILIES,
  THEME_COLOR_TOKENS,
  THEME_LABELS,
  UI_FONT_FAMILIES,
  type AiProviderId,
  type BuiltInThemeId,
  type EditorFontFamily,
  type ThemeColorToken,
  type UiFontFamily,
} from "../../../shared/settings";
import { type SearchSelectItem } from "../SearchSelect";

export type SettingsSectionId = "appearance" | "editor" | "theme" | "ai";

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
    id: "theme",
    label: "Theme Colors",
    description: "Surface and syntax overrides",
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
};

export { THEME_COLOR_TOKENS, THEME_LABELS };
