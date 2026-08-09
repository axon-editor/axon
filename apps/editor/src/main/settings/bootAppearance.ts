import { app } from "electron";
import fs from "fs";
import path from "path";
import type {
  ExtensionState,
  ResolvedExtensionTheme,
} from "../../shared/extensions";
import type { AxonSettings, ThemeColorToken } from "../../shared/settings";

export interface BootAppearance {
  themeId: string;
  appearance: "dark" | "light";
  background: string;
  foreground: string;
  accent: string;
}

export const DEFAULT_BOOT_APPEARANCE: BootAppearance = {
  themeId: "ayu-dark",
  appearance: "dark",
  background: "#313337",
  foreground: "#bfbdb6",
  accent: "#ffb353",
};

function isHexColor(value: unknown): value is string {
  return (
    typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
  );
}

function opaqueHex(value: unknown, fallback: string) {
  return isHexColor(value) ? value.slice(0, 7) : fallback;
}

function firstColor(
  theme: ResolvedExtensionTheme,
  keys: ThemeColorToken[],
  fallback: string,
) {
  for (const key of keys) {
    const color = theme.tokens[key];
    if (isHexColor(color)) return opaqueHex(color, fallback);
  }
  return fallback;
}

function enabledThemes(extensionState: ExtensionState) {
  const themesById = new Map<string, ResolvedExtensionTheme>();
  for (const extension of extensionState.extensions) {
    if (!extension.enabled) continue;
    for (const theme of extension.themes) {
      themesById.set(theme.id, theme);
    }
  }
  return themesById;
}

export function resolveBootAppearance(
  settings: AxonSettings,
  extensionState: ExtensionState,
): BootAppearance {
  const theme = enabledThemes(extensionState).get(settings.editor.themeId);
  if (!theme) return DEFAULT_BOOT_APPEARANCE;

  const appearance = theme.appearance === "light" ? "light" : "dark";
  const fallbackBackground = appearance === "light" ? "#ffffff" : "#0e1018";
  const fallbackForeground = appearance === "light" ? "#171717" : "#e6ebf5";
  const fallbackAccent = appearance === "light" ? "#17686e" : "#80c8e0";

  return {
    themeId: settings.editor.themeId,
    appearance,
    background: firstColor(
      theme,
      ["background", "title_bar.background", "editor.background"],
      fallbackBackground,
    ),
    foreground: firstColor(
      theme,
      ["editor.foreground", "terminal.foreground"],
      fallbackForeground,
    ),
    accent: firstColor(
      theme,
      ["syntax.function", "syntax.property", "syntax.type"],
      fallbackAccent,
    ),
  };
}

function getBootAppearancePath() {
  return path.join(app.getPath("userData"), "boot-appearance.json");
}

export function readBootAppearance(): BootAppearance {
  try {
    const raw = JSON.parse(
      fs.readFileSync(getBootAppearancePath(), "utf8"),
    ) as Partial<BootAppearance>;
    if (
      typeof raw.themeId !== "string" ||
      (raw.appearance !== "dark" && raw.appearance !== "light") ||
      !isHexColor(raw.background) ||
      !isHexColor(raw.foreground) ||
      !isHexColor(raw.accent)
    ) {
      return DEFAULT_BOOT_APPEARANCE;
    }

    return {
      themeId: raw.themeId,
      appearance: raw.appearance,
      background: opaqueHex(raw.background, DEFAULT_BOOT_APPEARANCE.background),
      foreground: opaqueHex(raw.foreground, DEFAULT_BOOT_APPEARANCE.foreground),
      accent: opaqueHex(raw.accent, DEFAULT_BOOT_APPEARANCE.accent),
    };
  } catch {
    return DEFAULT_BOOT_APPEARANCE;
  }
}

export function writeBootAppearance(
  settings: AxonSettings,
  extensionState: ExtensionState,
) {
  const appearancePath = getBootAppearancePath();
  const temporaryPath = `${appearancePath}.${process.pid}.tmp`;

  try {
    // The boot entrypoint intentionally reads one tiny cache instead of loading
    // and normalizing every extension before the first frame. Writing through a
    // process-specific temporary file keeps that startup contract intact even
    // if Axon is interrupted while Settings is being saved.
    fs.mkdirSync(path.dirname(appearancePath), { recursive: true });
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(resolveBootAppearance(settings, extensionState)),
      "utf8",
    );
    try {
      fs.renameSync(temporaryPath, appearancePath);
    } catch {
      // Windows can reject rename-over-existing even though POSIX replaces the
      // destination atomically. Remove only the old cache and retry so theme
      // changes still reach the next boot on every supported platform.
      fs.rmSync(appearancePath, { force: true });
      fs.renameSync(temporaryPath, appearancePath);
    }
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The cache is optional. A failed cleanup must not turn a valid settings
      // save into an application error; the next boot uses the default palette.
    }
    console.error("failed to cache boot appearance:", error);
  }
}
