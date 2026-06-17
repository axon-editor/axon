export const BUILT_IN_THEME_IDS = [
  "axon-dark",
  "sora",
  "zed-dark",
  "catppuccin-mocha",
  "ayu-dark",
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];
export type ThemeId = BuiltInThemeId | string;

export const AI_PROVIDER_IDS = ["openai", "local"] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const UI_FONT_FAMILIES = [
  ".AxonSans",
  ".ZedSans",
  "Axon Sans",
  "IBM Plex Sans",
  "Inter",
  "SF Pro Text",
  "system-ui",
] as const;

export const EDITOR_FONT_FAMILIES = [
  ".AxonMono",
  ".ZedMono",
  "Axon Mono",
  "Lilex",
  "IBM Plex Mono",
  "JetBrains Mono",
  "Fira Code",
  "Geist Mono",
  "Cascadia Code",
  "Berkeley Mono",
  "Monaspace Neon NF",
  "Monaspace Argon NF",
  "Monaspace Krypton NF",
  "Monaspace Radon NF",
  "Monaspace Xenon NF",
  "SF Mono",
  "Menlo",
  "Monaco",
] as const;

export type UiFontFamily = (typeof UI_FONT_FAMILIES)[number];
export type EditorFontFamily = (typeof EDITOR_FONT_FAMILIES)[number];

export const FONT_PRESET_IDS = [
  "axon-default",
  "zed-like",
  "jetbrains-mono",
  "sf-mono",
  "fira-code",
  "geist-mono",
  "cascadia-code",
  "berkeley-mono",
  "monaspace-neon-nerd",
  "apathy-ocean",
] as const;

export type FontPresetId = (typeof FONT_PRESET_IDS)[number];
export const EDITOR_BACKGROUND_IMAGE_FITS = [
  "cover",
  "contain",
  "fill",
  "center",
  "tile",
] as const;

export type EditorBackgroundImageFit =
  (typeof EDITOR_BACKGROUND_IMAGE_FITS)[number];

export const EDITOR_MULTI_CURSOR_MODIFIERS = ["alt", "ctrlCmd"] as const;
export type EditorMultiCursorModifier =
  (typeof EDITOR_MULTI_CURSOR_MODIFIERS)[number];

export const THEME_LABELS: Record<BuiltInThemeId, string> = {
  "axon-dark": "Axon Dark",
  sora: "Sora",
  "zed-dark": "Zed Dark",
  "catppuccin-mocha": "Catppuccin Mocha",
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
  "syntax.comment",
  "syntax.keyword",
  "syntax.string",
  "syntax.number",
  "syntax.type",
  "syntax.function",
  "syntax.method",
  "syntax.class",
  "syntax.interface",
  "syntax.variable",
  "syntax.parameter",
  "syntax.property",
  "syntax.constant",
  "syntax.operator",
  "syntax.bracket",
  "syntax.import",
  "syntax.tag",
  "syntax.attribute",
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
  fontPreset: FontPresetId;
  uiFontFamily: string;
  themeId: ThemeId;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  fontLigatures: boolean;
  appTransparency: boolean;
  appBackgroundOpacity: number;
  appBackgroundBlur: number;
  backgroundImagePath: string;
  backgroundImageOpacity: number;
  backgroundImageBlur: number;
  backgroundImageFit: EditorBackgroundImageFit;
  breadcrumbsEnabled: boolean;
  codeFoldingEnabled: boolean;
  emmetEnabled: boolean;
  formatOnSave: boolean;
  minimapEnabled: boolean;
  multiCursorModifier: EditorMultiCursorModifier;
  scrollbarMarkersEnabled: boolean;
  snippetsEnabled: boolean;
  stickyScrollEnabled: boolean;
}

export interface AxonSettings {
  editor: EditorSettings;
  ai: AiSettings;
  lsp: LspSettings;
  theme_overrides: ThemeOverrides;
  customFonts: CustomFont[];
  spotify: {
    clientId: string;
  };
}

export interface LspSettings {
  enabled: boolean;
  pythonVirtualEnvPath: string;
  pythonInterpreterPath: string;
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
    fontPreset: "axon-default",
    uiFontFamily: ".AxonSans",
    themeId: "ayu-dark",
    fontFamily: ".AxonMono",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: 400,
    fontLigatures: true,
    appTransparency: false,
    appBackgroundOpacity: 0.88,
    appBackgroundBlur: 0,
    backgroundImagePath: "",
    backgroundImageOpacity: 0.14,
    backgroundImageBlur: 0,
    backgroundImageFit: "cover",
    breadcrumbsEnabled: true,
    codeFoldingEnabled: true,
    emmetEnabled: true,
    formatOnSave: false,
    minimapEnabled: false,
    multiCursorModifier: "alt",
    scrollbarMarkersEnabled: true,
    snippetsEnabled: true,
    stickyScrollEnabled: true,
  },
  ai: {
    enabled: false,
    provider: "openai",
    model: "gpt-5.1",
    apiKeyEnv: "OPENAI_API_KEY",
    includeWorkspaceContext: true,
  },
  lsp: {
    enabled: true,
    pythonVirtualEnvPath: "",
    pythonInterpreterPath: "",
  },
  theme_overrides: {},
  customFonts: [],
  spotify: {
    clientId: "",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value.trim().length > 0;
}

function isAiProviderId(value: unknown): value is AiProviderId {
  return (
    typeof value === "string" && AI_PROVIDER_IDS.includes(value as AiProviderId)
  );
}

function isFontPresetId(value: unknown): value is FontPresetId {
  return (
    typeof value === "string" && FONT_PRESET_IDS.includes(value as FontPresetId)
  );
}

function isEditorBackgroundImageFit(
  value: unknown,
): value is EditorBackgroundImageFit {
  return (
    typeof value === "string" &&
    EDITOR_BACKGROUND_IMAGE_FITS.includes(
      value as EditorBackgroundImageFit,
    )
  );
}

function isEditorMultiCursorModifier(
  value: unknown,
): value is EditorMultiCursorModifier {
  return (
    typeof value === "string" &&
    EDITOR_MULTI_CURSOR_MODIFIERS.includes(
      value as EditorMultiCursorModifier,
    )
  );
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
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
  const lsp = isRecord(root.lsp) ? root.lsp : {};

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
      fontPreset: isFontPresetId(editor.fontPreset)
        ? editor.fontPreset
        : DEFAULT_SETTINGS.editor.fontPreset,
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
      fontWeight: clampNumber(
        editor.fontWeight,
        DEFAULT_SETTINGS.editor.fontWeight,
        200,
        800,
      ),
      fontLigatures:
        typeof editor.fontLigatures === "boolean"
          ? editor.fontLigatures
          : DEFAULT_SETTINGS.editor.fontLigatures,
      appTransparency:
        typeof editor.appTransparency === "boolean"
          ? editor.appTransparency
          : DEFAULT_SETTINGS.editor.appTransparency,
      appBackgroundOpacity: clampNumber(
        editor.appBackgroundOpacity,
        DEFAULT_SETTINGS.editor.appBackgroundOpacity,
        0.2,
        1,
      ),
      appBackgroundBlur: clampNumber(
        editor.appBackgroundBlur,
        DEFAULT_SETTINGS.editor.appBackgroundBlur,
        0,
        40,
      ),
      backgroundImagePath:
        typeof editor.backgroundImagePath === "string"
          ? editor.backgroundImagePath.trim()
          : DEFAULT_SETTINGS.editor.backgroundImagePath,
      backgroundImageOpacity: clampNumber(
        editor.backgroundImageOpacity,
        DEFAULT_SETTINGS.editor.backgroundImageOpacity,
        0,
        1,
      ),
      backgroundImageBlur: clampNumber(
        editor.backgroundImageBlur,
        DEFAULT_SETTINGS.editor.backgroundImageBlur,
        0,
        40,
      ),
      backgroundImageFit: isEditorBackgroundImageFit(
        editor.backgroundImageFit,
      )
        ? editor.backgroundImageFit
        : DEFAULT_SETTINGS.editor.backgroundImageFit,
      breadcrumbsEnabled:
        typeof editor.breadcrumbsEnabled === "boolean"
          ? editor.breadcrumbsEnabled
          : DEFAULT_SETTINGS.editor.breadcrumbsEnabled,
      codeFoldingEnabled:
        typeof editor.codeFoldingEnabled === "boolean"
          ? editor.codeFoldingEnabled
          : DEFAULT_SETTINGS.editor.codeFoldingEnabled,
      emmetEnabled:
        typeof editor.emmetEnabled === "boolean"
          ? editor.emmetEnabled
          : DEFAULT_SETTINGS.editor.emmetEnabled,
      formatOnSave:
        typeof editor.formatOnSave === "boolean"
          ? editor.formatOnSave
          : DEFAULT_SETTINGS.editor.formatOnSave,
      minimapEnabled:
        typeof editor.minimapEnabled === "boolean"
          ? editor.minimapEnabled
          : DEFAULT_SETTINGS.editor.minimapEnabled,
      multiCursorModifier: isEditorMultiCursorModifier(
        editor.multiCursorModifier,
      )
        ? editor.multiCursorModifier
        : DEFAULT_SETTINGS.editor.multiCursorModifier,
      scrollbarMarkersEnabled:
        typeof editor.scrollbarMarkersEnabled === "boolean"
          ? editor.scrollbarMarkersEnabled
          : DEFAULT_SETTINGS.editor.scrollbarMarkersEnabled,
      snippetsEnabled:
        typeof editor.snippetsEnabled === "boolean"
          ? editor.snippetsEnabled
          : DEFAULT_SETTINGS.editor.snippetsEnabled,
      stickyScrollEnabled:
        typeof editor.stickyScrollEnabled === "boolean"
          ? editor.stickyScrollEnabled
          : DEFAULT_SETTINGS.editor.stickyScrollEnabled,
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
    lsp: {
      enabled:
        typeof lsp.enabled === "boolean"
          ? lsp.enabled
          : DEFAULT_SETTINGS.lsp.enabled,
      pythonVirtualEnvPath:
        typeof lsp.pythonVirtualEnvPath === "string"
          ? lsp.pythonVirtualEnvPath.trim()
          : DEFAULT_SETTINGS.lsp.pythonVirtualEnvPath,
      pythonInterpreterPath:
        typeof lsp.pythonInterpreterPath === "string"
          ? lsp.pythonInterpreterPath.trim()
          : DEFAULT_SETTINGS.lsp.pythonInterpreterPath,
    },
    theme_overrides: normalizeThemeOverrides(root.theme_overrides),
    customFonts: normalizeCustomFonts(root.customFonts),
    spotify: {
      clientId:
        typeof (isRecord(root.spotify) ? root.spotify.clientId : "") ===
        "string"
          ? (
              (isRecord(root.spotify) ? root.spotify.clientId : "") as string
            ).trim()
          : DEFAULT_SETTINGS.spotify.clientId,
    },
  };
}
