export const BUILT_IN_THEME_IDS = [
  "axon-dark",
  "sora",
  "catppuccin-mocha",
  "tokyo-night",
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];

export interface EditorSettings {
  themeId: BuiltInThemeId;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontLigatures: boolean;
}

export interface AxonSettings {
  editor: EditorSettings;
}

export const DEFAULT_SETTINGS: AxonSettings = {
  editor: {
    themeId: "axon-dark",
    fontFamily: "Fira Code",
    fontSize: 14,
    lineHeight: 22,
    fontLigatures: true,
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

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeSettings(value: unknown): AxonSettings {
  const root = isRecord(value) ? value : {};
  const editor = isRecord(root.editor) ? root.editor : {};

  const fontFamily =
    typeof editor.fontFamily === "string" && editor.fontFamily.trim()
      ? editor.fontFamily.trim()
      : DEFAULT_SETTINGS.editor.fontFamily;

  return {
    editor: {
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
  };
}
