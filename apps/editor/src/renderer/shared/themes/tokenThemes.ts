/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Monaco-free half of the theme system. Registering Monaco themes (registerAxonTheme)
// lives in themes/index.ts, but token completion and active-theme resolution are pure
// data work. Keeping them out of the barrel lets the dedicated Settings window render
// its chrome from CSS variables without dragging the 4MB Monaco engine into its entry.

import {
  DEFAULT_THEME_ID,
  THEME_COLOR_TOKENS,
  type AxonSettings,
  type ThemeColorToken,
  type ThemeId,
} from "../../../shared/settings";
import {
  resolveExtensionTheme,
  type ResolvedExtensionTheme,
} from "../../../shared/extensions";
import { type ThemeTokenMap } from "./types";

export type { ThemeTokenMap } from "./types";

export const AXON_MONACO_THEME = "axon-dark";

// Themes normally come entirely from the extension registry. This minimal
// in-process copy exists so a registry startup failure cannot prevent React
// from mounting and leave the user with an unrecoverable blank window. It is
// deliberately limited to foundational colors; normal startup still resolves
// the complete Axon Black contribution, including its syntax palette.
const emergencyAxonBlackTheme: ResolvedExtensionTheme = {
  id: DEFAULT_THEME_ID,
  label: "Axon Black",
  extensionId: "axon.emergency-theme",
  extensionName: "Axon Emergency Theme",
  appearance: "dark",
  tokens: {
    background: "#000000",
    "editor.background": "#000000",
    "editor.foreground": "#e8e8e8",
    "panel.background": "#000000",
    "panel.border": "#202020",
  },
  syntax: {},
  terminal: {},
  monaco: {},
};

export function resolveActiveTheme(
  themeId: ThemeId,
  extensionThemes: readonly ResolvedExtensionTheme[] = [],
) {
  return (
    resolveExtensionTheme(extensionThemes, themeId) ?? emergencyAxonBlackTheme
  );
}

export function getThemeLabel(
  themeId: ThemeId,
  extensionThemes: ResolvedExtensionTheme[] = [],
) {
  return resolveActiveTheme(themeId, extensionThemes).label;
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

export function completeThemeTokens(
  extensionTheme: ResolvedExtensionTheme,
): ThemeTokenMap {
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
  const extensionTheme = resolveActiveTheme(
    settings.editor.themeId,
    extensionThemes,
  );

  // Theme colors are now owned by extension packages. Keeping runtime override
  // layering here would make the same built-in theme render differently from
  // its JSON contribution, which is exactly the drift the extension-host
  // migration is meant to remove.
  return completeThemeTokens(extensionTheme);
}