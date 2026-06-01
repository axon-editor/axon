import {
  THEME_LABELS,
  type AxonSettings,
  type ThemeColorToken,
} from "../../shared/settings";
import { type CSSProperties } from "react";

export type ResolvedThemeTokens = Record<ThemeColorToken, string>;

const FALLBACK_THEME_TOKENS: ResolvedThemeTokens = {
  background: "#0e1018",
  "status_bar.background": "#0a0c12",
  "title_bar.background": "#0a0c12",
  "toolbar.background": "#0a0c12",
  "sidebar.background": "#0a0c12",
  "sidebar.border": "#222838",
  "tab.active_background": "#151923",
  "panel.background": "#0a0c12",
  "panel.border": "#222838",
  "panel.overlay_hover": "#151923",
  "editor.foreground": "#c8d0e0",
  "editor.background": "#0e1018",
  "editor.gutter.background": "#0e1018",
  "terminal.background": "#0e1018",
  "terminal.foreground": "#c8d0e0",
};

export function resolveThemeTokens(settings: AxonSettings): ResolvedThemeTokens {
  const themeLabel = THEME_LABELS[settings.editor.themeId];
  const overrides =
    settings.theme_overrides[themeLabel] ??
    settings.theme_overrides[settings.editor.themeId] ??
    {};

  return {
    ...FALLBACK_THEME_TOKENS,
    ...overrides,
  };
}

export function createThemeCssVariables(tokens: ResolvedThemeTokens) {
  // These variables are the bridge between axon.json and the React chrome.
  // Keeping the names close to the settings tokens makes it obvious which JSON
  // key controls each visible surface when the settings UI is rebuilt further.
  return {
    "--axon-background": tokens.background,
    "--axon-status-bar-background": tokens["status_bar.background"],
    "--axon-title-bar-background": tokens["title_bar.background"],
    "--axon-toolbar-background": tokens["toolbar.background"],
    "--axon-sidebar-background": tokens["sidebar.background"],
    "--axon-sidebar-border": tokens["sidebar.border"],
    "--axon-tab-active-background": tokens["tab.active_background"],
    "--axon-panel-background": tokens["panel.background"],
    "--axon-panel-border": tokens["panel.border"],
    "--axon-panel-overlay-hover": tokens["panel.overlay_hover"],
    "--axon-editor-foreground": tokens["editor.foreground"],
    "--axon-editor-background": tokens["editor.background"],
    "--axon-editor-gutter-background": tokens["editor.gutter.background"],
    "--axon-terminal-background": tokens["terminal.background"],
    "--axon-terminal-foreground": tokens["terminal.foreground"],
  } as CSSProperties;
}
