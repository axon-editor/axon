import { type CSSProperties } from "react";
import { resolveThemeTokens, type ThemeTokenMap } from "../themes";
import { type ResolvedExtensionTheme } from "../../../shared/extensions";
import {
  appearanceBorderColor,
  resolveThemeGitColors,
  type ThemeAppearance,
} from "../themes/themeAppearance";

export type ResolvedThemeTokens = ThemeTokenMap;

export { resolveThemeTokens };

export function resolveThemeTokensWithExtensions(
  settings: Parameters<typeof resolveThemeTokens>[0],
  extensionThemes: ResolvedExtensionTheme[],
) {
  return resolveThemeTokens(settings, extensionThemes);
}

export function createThemeCssVariables(
  tokens: ResolvedThemeTokens,
  appearance: ThemeAppearance = "dark",
) {
  const gitColors = resolveThemeGitColors(appearance);
  const panelBorder = appearanceBorderColor(tokens["panel.border"], appearance);
  const sidebarBorder = appearanceBorderColor(
    tokens["sidebar.border"],
    appearance,
  );
  // These variables are the bridge between axon.json and the React chrome.
  // They are resolved from the active built-in theme first, then user override
  // values are layered on top. That keeps defaults clean while still making
  // theme_overrides affect every visible Axon surface immediately.
  return {
    "--axon-background": tokens.background,
    "--axon-status-bar-background": tokens["status_bar.background"],
    "--axon-title-bar-background": tokens["title_bar.background"],
    "--axon-toolbar-background": tokens["toolbar.background"],
    "--axon-sidebar-background": tokens["sidebar.background"],
    "--axon-sidebar-hover-background": tokens["sidebar.hover_background"],
    "--axon-sidebar-border": sidebarBorder,
    "--axon-tab-active-background": tokens["tab.active_background"],
    "--axon-panel-background": tokens["panel.background"],
    "--axon-panel-border": panelBorder,
    "--axon-panel-overlay-hover": tokens["panel.overlay_hover"],
    "--axon-editor-foreground": tokens["editor.foreground"],
    "--axon-editor-background": tokens["editor.background"],
    "--axon-editor-gutter-background": tokens["editor.gutter.background"],
    "--axon-terminal-background": tokens["terminal.background"],
    "--axon-terminal-foreground": tokens["terminal.foreground"],
    "--axon-syntax-function": tokens["syntax.function"],
    "--axon-syntax-method": tokens["syntax.method"],
    "--axon-git-added": gitColors.added,
    "--axon-git-modified": gitColors.modified,
    "--axon-git-deleted": gitColors.deleted,
    "--axon-git-mixed": gitColors.mixed,
    "--axon-info-foreground": gitColors.mixed,
    "--axon-warning-foreground": gitColors.modified,
    "--axon-danger-foreground": gitColors.deleted,
    "--axon-danger-background": gitColors.dangerBackground,
    colorScheme: appearance,
  } as CSSProperties;
}
