export const BUILT_IN_THEME_IDS = [
  "axon-dark",
  "sora",
  "catppuccin-mocha",
  "tokyo-night",
  "ayu-dark",
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];

export const AI_PROVIDER_IDS = ["openai", "local"] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const UI_FONT_FAMILIES = [
  ".AxonSans",
  "Axon Sans",
  "Inter",
  "SF Pro Text",
  "system-ui",
] as const;

export const EDITOR_FONT_FAMILIES = [
  ".AxonMono",
  "Axon Mono",
  "JetBrains Mono",
  "Fira Code",
  "SF Mono",
  "Menlo",
  "Monaco",
] as const;

export type UiFontFamily = (typeof UI_FONT_FAMILIES)[number];
export type EditorFontFamily = (typeof EDITOR_FONT_FAMILIES)[number];

export const THEME_LABELS: Record<BuiltInThemeId, string> = {
  "axon-dark": "Axon Dark",
  sora: "Sora",
  "catppuccin-mocha": "Catppuccin Mocha",
  "tokyo-night": "Tokyo Night",
  "ayu-dark": "Ayu Dark",
};

export const THEME_COLOR_TOKENS = [
  "background",
  "status_bar.background",
  "title_bar.background",
  "toolbar.background",
  "sidebar.background",
  "sidebar.border",
  "tab.active_background",
  "panel.background",
  "panel.border",
  "panel.overlay_hover",
  "editor.foreground",
  "editor.background",
  "editor.gutter.background",
  "terminal.background",
  "terminal.foreground",
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
export type ThemeOverride = Partial<Record<ThemeColorToken, string>>;
export type ThemeOverrides = Partial<Record<string, ThemeOverride>>;

export interface CustomFont {
  family: string;
  url: string;
  path: string;
}

export interface EditorSettings {
  uiFontFamily: string;
  themeId: BuiltInThemeId;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontLigatures: boolean;
}

export interface AxonSettings {
  editor: EditorSettings;
  ai: AiSettings;
  theme_overrides: ThemeOverrides;
  customFonts: CustomFont[];
}

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  apiKeyEnv: string;
  includeWorkspaceContext: boolean;
}

export const DEFAULT_SETTINGS: AxonSettings = {
  editor: {
    uiFontFamily: ".AxonSans",
    themeId: "ayu-dark",
    fontFamily: ".AxonMono",
    fontSize: 14,
    lineHeight: 22,
    fontLigatures: true,
  },
  ai: {
    enabled: false,
    provider: "openai",
    model: "gpt-5.1",
    apiKeyEnv: "OPENAI_API_KEY",
    includeWorkspaceContext: true,
  },
  theme_overrides: {
    "Ayu Dark": {
      background: "#000000FF",
      "status_bar.background": "#000000FF",
      "title_bar.background": "#000000FF",
      "toolbar.background": "#000000FF",
      "sidebar.background": "#000000FF",
      "sidebar.border": "#000000FF",
      "tab.active_background": "#000000FF",
      "panel.background": "#000000FF",
      "panel.border": "#000000FF",
      "editor.foreground": "#000000FF",
      "editor.background": "#000000FF",
      "editor.gutter.background": "#000000FF",
      "terminal.background": "#000000FF",
      "terminal.foreground": "#000000FF",
      "panel.overlay_hover": "#000000FF",
    },
  },
  customFonts: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isThemeId(value: unknown): value is BuiltInThemeId {
  return (
    typeof value === "string" &&
    BUILT_IN_THEME_IDS.includes(value as BuiltInThemeId)
  );
}

function isAiProviderId(value: unknown): value is AiProviderId {
  return (
    typeof value === "string" &&
    AI_PROVIDER_IDS.includes(value as AiProviderId)
  );
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim());
}

function normalizeThemeOverrides(value: unknown): ThemeOverrides {
  if (!isRecord(value)) return DEFAULT_SETTINGS.theme_overrides;

  const normalized: ThemeOverrides = {};
  for (const [themeName, overrides] of Object.entries(value)) {
    if (!isRecord(overrides)) continue;

    const themeOverrides: ThemeOverride = {};
    for (const token of THEME_COLOR_TOKENS) {
      const color = overrides[token];
      if (typeof color === "string" && isHexColor(color)) {
        themeOverrides[token] = color.trim();
      }
    }

    if (Object.keys(themeOverrides).length > 0) {
      normalized[themeName] = themeOverrides;
    }
  }

  const merged: ThemeOverrides = { ...DEFAULT_SETTINGS.theme_overrides };
  for (const [themeName, overrides] of Object.entries(normalized)) {
    merged[themeName] = {
      ...(merged[themeName] ?? {}),
      ...overrides,
    };
  }

  return merged;
}

function normalizeCustomFonts(value: unknown): CustomFont[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.customFonts;

  const seenFamilies = new Set<string>();
  return value
    .filter((font): font is Record<string, unknown> => isRecord(font))
    .map((font) => {
      const family = typeof font.family === "string" ? font.family.trim() : "";
      const url = typeof font.url === "string" ? font.url.trim() : "";
      const fontPath = typeof font.path === "string" ? font.path.trim() : "";
      if (!family || !url || !fontPath) return null;
      if (seenFamilies.has(family)) return null;
      seenFamilies.add(family);
      return { family, url, path: fontPath };
    })
    .filter((font): font is CustomFont => font !== null);
}

export function normalizeSettings(value: unknown): AxonSettings {
  const root = isRecord(value) ? value : {};
  const editor = isRecord(root.editor) ? root.editor : {};
  const ai = isRecord(root.ai) ? root.ai : {};

  const rawFontFamily =
    typeof editor.fontFamily === "string" ? editor.fontFamily.trim() : "";
  const fontFamily =
    rawFontFamily && rawFontFamily !== "Fira Code"
      ? rawFontFamily
      : DEFAULT_SETTINGS.editor.fontFamily;

  const uiFontFamily =
    typeof editor.uiFontFamily === "string" && editor.uiFontFamily.trim()
      ? editor.uiFontFamily.trim()
      : DEFAULT_SETTINGS.editor.uiFontFamily;

  const aiModel =
    typeof ai.model === "string" && ai.model.trim()
      ? ai.model.trim()
      : DEFAULT_SETTINGS.ai.model;

  const apiKeyEnv =
    typeof ai.apiKeyEnv === "string" && ai.apiKeyEnv.trim()
      ? ai.apiKeyEnv.trim()
      : DEFAULT_SETTINGS.ai.apiKeyEnv;

  return {
    editor: {
      uiFontFamily,
      themeId: isThemeId(editor.themeId)
        ? editor.themeId
        : DEFAULT_SETTINGS.editor.themeId,
      fontFamily,
      fontSize: clampNumber(
        editor.fontSize,
        DEFAULT_SETTINGS.editor.fontSize,
        10,
        28,
      ),
      lineHeight: clampNumber(
        editor.lineHeight,
        DEFAULT_SETTINGS.editor.lineHeight,
        14,
        40,
      ),
      fontLigatures:
        typeof editor.fontLigatures === "boolean"
          ? editor.fontLigatures
          : DEFAULT_SETTINGS.editor.fontLigatures,
    },
    ai: {
      enabled:
        typeof ai.enabled === "boolean"
          ? ai.enabled
          : DEFAULT_SETTINGS.ai.enabled,
      provider: isAiProviderId(ai.provider)
        ? ai.provider
        : DEFAULT_SETTINGS.ai.provider,
      model: aiModel,
      apiKeyEnv,
      includeWorkspaceContext:
        typeof ai.includeWorkspaceContext === "boolean"
          ? ai.includeWorkspaceContext
          : DEFAULT_SETTINGS.ai.includeWorkspaceContext,
    },
    theme_overrides: normalizeThemeOverrides(root.theme_overrides),
    customFonts: normalizeCustomFonts(root.customFonts),
  };
}
