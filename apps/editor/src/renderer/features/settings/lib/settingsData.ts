import {
  AI_PROVIDER_IDS,
  EDITOR_FONT_FAMILIES,
  EDITOR_CURSOR_BLINKING,
  EDITOR_CURSOR_STYLES,
  EDITOR_BACKGROUND_IMAGE_FITS,
  EDITOR_MULTI_CURSOR_MODIFIERS,
  FONT_PRESET_IDS,
  UI_FONT_FAMILIES,
  type AiProviderId,
  type EditorSidebarSide,
  type EditorFontFamily,
  type EditorCursorBlinking,
  type EditorCursorStyle,
  type EditorBackgroundImageFit,
  type EditorMultiCursorModifier,
  type FontPresetId,
  type UiFontFamily,
} from "../../../../shared/settings";
import { type SearchSelectItem } from "../../search/SearchSelect";

export type SettingsSectionId =
  | "appearance"
  | "editor"
  | "ergonomics"
  | "background"
  | "fonts"
  | "languageServers"
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
    id: "ergonomics",
    label: "Ergonomics",
    description: "Navigation, snippets, and folding",
  },
  {
    id: "background",
    label: "Background",
    description: "Opacity and editor image",
  },
  {
    id: "languageServers",
    label: "Language Servers",
    description: "Project-aware editor services",
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

export const UI_FONT_ITEMS: SearchSelectItem<UiFontFamily>[] =
  UI_FONT_FAMILIES.map((fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
    previewFontFamily: fontFamily,
  }));

export const EDITOR_FONT_ITEMS: SearchSelectItem<EditorFontFamily>[] =
  EDITOR_FONT_FAMILIES.map((fontFamily) => ({
    value: fontFamily,
    label: fontFamily,
    previewFontFamily: fontFamily,
  }));

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

const MULTI_CURSOR_MODIFIER_LABELS: Record<EditorMultiCursorModifier, string> = {
  alt: "Alt / Option",
  ctrlCmd: "Ctrl / Command",
};

export const MULTI_CURSOR_MODIFIER_ITEMS: SearchSelectItem<EditorMultiCursorModifier>[] =
  EDITOR_MULTI_CURSOR_MODIFIERS.map((modifier) => ({
    value: modifier,
    label: MULTI_CURSOR_MODIFIER_LABELS[modifier],
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
