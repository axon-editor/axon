/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  AI_PROVIDER_IDS,
  APP_GLASS_MODES,
  EDITOR_FONT_FAMILIES,
  EDITOR_CURSOR_BLINKING,
  EDITOR_CURSOR_STYLES,
  EDITOR_BACKGROUND_IMAGE_FITS,
  EDITOR_HOVER_PLACEMENTS,
  EDITOR_MULTI_CURSOR_MODIFIERS,
  FONT_PRESET_IDS,
  TERMINAL_GPU_ACCELERATION_VALUES,
  UI_FONT_FAMILIES,
  type AiProviderId,
  type AppGlassMode,
  type EditorSettingsSurface,
  type EditorSidebarSide,
  type EditorFontFamily,
  type EditorCursorBlinking,
  type EditorCursorStyle,
  type EditorBackgroundImageFit,
  type EditorHoverPlacement,
  type EditorMultiCursorModifier,
  type FontPresetId,
  type TerminalGpuAcceleration,
  type UiFontFamily,
} from "@axon-editor/shared/settings";
import { type SearchSelectItem } from "@axon-editor/base/components/SearchSelect";

export type SettingsSectionId =
  | "appearance"
  | "editor"
  | "terminal"
  | "background"
  | "fonts"
  | "languageServers"
  | "ai"
  | "finder";

export type SettingsGroupId = "appearance" | "editor" | "terminal" | "intelligence";

export interface SettingsGroupDefinition {
  id: SettingsGroupId;
  label: string;
}

// The sidebar groups related sections together so the flat seven-item list
// does not grow into a wall of links as Axon gains more settings. These four
// groups mirror how users think about a workbench: what it looks like, how the
// editor types, the terminal, and the local intelligence services (AI + LSP).
export const SETTINGS_GROUPS: SettingsGroupDefinition[] = [
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "terminal", label: "Terminal" },
  { id: "intelligence", label: "Intelligence" },
];

export interface SettingsSectionDefinition {
  id: SettingsSectionId;
  group: SettingsGroupId;
  label: string;
  description: string;
  // Extra terms users type that are not already visible in the label or
  // description, so search like "glass", "ligatures", or "venv" finds the
  // right page without the user guessing the exact setting row name.
  keywords: string[];
}

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    id: "appearance",
    group: "appearance",
    label: "Appearance",
    description: "Theme and UI font",
    keywords: ["theme", "ui font", "sidebar side", "layout"],
  },
  {
    id: "background",
    group: "appearance",
    label: "Background",
    description: "Opacity and editor image",
    keywords: ["glass", "mica", "acrylic", "vibrancy", "blur", "image", "wallpaper"],
  },
  {
    id: "fonts",
    group: "appearance",
    label: "Fonts",
    description: "Import and apply custom fonts",
    keywords: ["import", "ttf", "otf", "woff", "custom font"],
  },
  {
    id: "editor",
    group: "editor",
    label: "Editor",
    description: "Text, completion, navigation, and save behavior",
    keywords: [
      "typography",
      "ligature",
      "completion",
      "suggest",
      "cursor",
      "indent",
      "tab size",
      "spacing",
      "guide",
      "auto save",
      "format save",
      "snippet",
      "emmet",
      "multi cursor",
      "breadcrumb",
      "hover",
      "sticky scroll",
      "line trace",
      "code folding",
      "minimap",
      "scrollbar",
      "remember expanded folders",
    ],
  },
  {
    id: "terminal",
    group: "terminal",
    label: "Terminal",
    description: "Rendering and GPU acceleration",
    keywords: ["gpu", "acceleration", "webgl", "render", "xterm"],
  },
  {
    id: "languageServers",
    group: "intelligence",
    label: "Language Servers",
    description: "Project-aware editor services",
    keywords: ["lsp", "python", "virtual env", "venv", "interpreter", "pyright", "diagnostics", "logs"],
  },
  {
    id: "ai",
    group: "intelligence",
    label: "AI",
    description: "Local models, inline completions, and workspace context",
    keywords: ["model", "provider", "inline completion", "agent", "chat", "workspace context"],
  },
  {
    id: "finder",
    group: "appearance",
    label: "Finder",
    description: "Open folders in Axon from the Finder",
    keywords: ["context menu", "open in axon", "macos", "file manager", "extension"],
  },
];

const UI_FONT_PRESENTATION: Partial<Record<
  UiFontFamily,
  Pick<SearchSelectItem<UiFontFamily>, "label" | "previewFontFamily">
>> = {
  ".AxonSans": {
    label: "Axon Sans",
    previewFontFamily: "Inter Variable",
  },
  ".ZedSans": {
    label: "Zed Sans",
    previewFontFamily: "IBM Plex Sans Variable",
  },
  "system-ui": {
    label: "System UI",
    previewFontFamily: "system-ui",
  },
};

export const UI_FONT_ITEMS: SearchSelectItem<UiFontFamily>[] =
  UI_FONT_FAMILIES.map((fontFamily) => {
    const presentation = UI_FONT_PRESENTATION[fontFamily];
    return {
      value: fontFamily,
      label: presentation?.label ?? fontFamily,
      previewFontFamily: presentation?.previewFontFamily ?? fontFamily,
    };
  });

const EDITOR_FONT_PRESENTATION: Partial<
  Record<
    EditorFontFamily,
    Pick<SearchSelectItem<EditorFontFamily>, "previewFontFamily">
  >
> = {
  "Fira Code": { previewFontFamily: "Fira Code Variable" },
  "JetBrains Mono": { previewFontFamily: "JetBrains Mono Variable" },
};

export const EDITOR_FONT_ITEMS: SearchSelectItem<EditorFontFamily>[] =
  EDITOR_FONT_FAMILIES.map((fontFamily) => {
    const presentation = EDITOR_FONT_PRESENTATION[fontFamily];
    return {
      value: fontFamily,
      label: fontFamily,
      previewFontFamily: presentation?.previewFontFamily ?? fontFamily,
    };
  });

const EDITOR_CURSOR_STYLE_LABELS: Record<EditorCursorStyle, string> = {
  line: "Line",
  "line-thin": "Thin line",
  block: "Block",
  "block-outline": "Block outline",
  underline: "Underline",
  "underline-thin": "Thin underline",
};

export const EDITOR_CURSOR_STYLE_ITEMS: SearchSelectItem<EditorCursorStyle>[] =
  EDITOR_CURSOR_STYLES.map((cursorStyle) => ({
    value: cursorStyle,
    label: EDITOR_CURSOR_STYLE_LABELS[cursorStyle],
  }));

const EDITOR_CURSOR_BLINKING_LABELS: Record<EditorCursorBlinking, string> = {
  blink: "Blink",
  smooth: "Smooth",
  phase: "Phase",
  expand: "Expand",
  solid: "Solid",
};

export const EDITOR_CURSOR_BLINKING_ITEMS: SearchSelectItem<EditorCursorBlinking>[] =
  EDITOR_CURSOR_BLINKING.map((cursorBlinking) => ({
    value: cursorBlinking,
    label: EDITOR_CURSOR_BLINKING_LABELS[cursorBlinking],
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
  "monaspace-neon-nerd": "Monaspace Neon NF",
  "apathy-ocean": "Apathy Ocean",
};

export const FONT_PRESET_ITEMS: SearchSelectItem<FontPresetId>[] =
  FONT_PRESET_IDS.map((presetId) => ({
    value: presetId,
    label: FONT_PRESET_LABELS[presetId],
  }));

const EDITOR_BACKGROUND_IMAGE_FIT_LABELS: Record<
  EditorBackgroundImageFit,
  string
> = {
  cover: "Cover",
  contain: "Contain",
  fill: "Fill",
  center: "Center",
  tile: "Tile",
};

export const EDITOR_BACKGROUND_IMAGE_FIT_ITEMS: SearchSelectItem<EditorBackgroundImageFit>[] =
  EDITOR_BACKGROUND_IMAGE_FITS.map((fit) => ({
    value: fit,
    label: EDITOR_BACKGROUND_IMAGE_FIT_LABELS[fit],
  }));

const APP_GLASS_MODE_PRESENTATION: Record<
  AppGlassMode,
  Pick<SearchSelectItem<AppGlassMode>, "label" | "description">
> = {
  off: {
    label: "Off",
    description: "Use the active theme as an opaque application surface.",
  },
  system: {
    label: "System Glass",
    description: "Use macOS vibrancy or the efficient Windows Mica material.",
  },
  live: {
    label: "Live Glass",
    description:
      "Use live native blur, including Windows Acrylic where available.",
  },
};

export const APP_GLASS_MODE_ITEMS: SearchSelectItem<AppGlassMode>[] =
  APP_GLASS_MODES.map((mode) => ({
    value: mode,
    ...APP_GLASS_MODE_PRESENTATION[mode],
  }));

const MULTI_CURSOR_MODIFIER_LABELS: Record<EditorMultiCursorModifier, string> = {
  alt: "Alt / Option",
  ctrlCmd: "Ctrl / Command",
};

export const MULTI_CURSOR_MODIFIER_ITEMS: SearchSelectItem<EditorMultiCursorModifier>[] =
  EDITOR_MULTI_CURSOR_MODIFIERS.map((modifier) => ({
    value: modifier,
    label: MULTI_CURSOR_MODIFIER_LABELS[modifier],
  }));

const EDITOR_HOVER_PLACEMENT_LABELS: Record<EditorHoverPlacement, string> = {
  top: "Top",
  bottom: "Bottom",
};

export const EDITOR_HOVER_PLACEMENT_ITEMS: SearchSelectItem<EditorHoverPlacement>[] =
  EDITOR_HOVER_PLACEMENTS.map((placement) => ({
    value: placement,
    label: EDITOR_HOVER_PLACEMENT_LABELS[placement],
  }));

const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  local: "Axon models",
};

export const AI_PROVIDER_ITEMS: SearchSelectItem<AiProviderId>[] =
  AI_PROVIDER_IDS.map((provider) => ({
    value: provider,
    label: AI_PROVIDER_LABELS[provider],
  }));

export const EDITOR_SIDEBAR_SIDE_ITEMS: SearchSelectItem<EditorSidebarSide>[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export const EDITOR_SETTINGS_SURFACE_ITEMS: SearchSelectItem<EditorSettingsSurface>[] = [
  {
    value: "tab",
    label: "Editor tab (default)",
    description: "Open settings as a tab in the current editor window.",
  },
  {
    value: "window",
    label: "Separate window",
    description:
      "Open settings in a dedicated window that every editor window reuses.",
  },
];

const TERMINAL_GPU_ACCELERATION_LABELS: Record<
  TerminalGpuAcceleration,
  string
> = {
  auto: "Auto",
  on: "On",
  off: "Off",
};

export const TERMINAL_GPU_ACCELERATION_ITEMS: SearchSelectItem<TerminalGpuAcceleration>[] =
  TERMINAL_GPU_ACCELERATION_VALUES.map((mode) => ({
    value: mode,
    label: TERMINAL_GPU_ACCELERATION_LABELS[mode],
  }));
