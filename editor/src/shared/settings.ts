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
    themeId: "axon-dark",
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
  };
}
