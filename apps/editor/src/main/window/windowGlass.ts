import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  nativeTheme,
} from "electron";
import { isAppGlassMode, type AppGlassMode } from "../../shared/settings";

const TRANSPARENT_WINDOW_BACKGROUND = "#00000000";
type NativeGlassAppearance = "light" | "dark";

function supportsNativeGlass() {
  return process.platform === "darwin" || process.platform === "win32";
}

function safeOpaqueBackground(background: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(background)
    ? background.slice(0, 7)
    : "#0e1018";
}

function isNativeGlassAppearance(
  appearance: unknown,
): appearance is NativeGlassAppearance {
  return appearance === "light" || appearance === "dark";
}

export function synchronizeNativeGlassAppearance(
  mode: AppGlassMode,
  appearance: unknown,
) {
  // Native vibrancy follows Electron's nativeTheme rather than the colors in
  // the renderer. Matching it to Axon's selected theme keeps dark text legible
  // on light Glass and light text legible on dark Glass without placing any
  // CSS color between the editor and the operating system's blurred material.
  nativeTheme.themeSource =
    mode !== "off" && isNativeGlassAppearance(appearance)
      ? appearance
      : "system";
}

export function getWindowGlassConstructorOptions(
  mode: AppGlassMode,
): Pick<
  BrowserWindowConstructorOptions,
  "backgroundMaterial" | "vibrancy" | "visualEffectState"
> {
  if (mode === "off") return {};

  if (process.platform === "darwin") {
    return {
      vibrancy: "under-window",
      visualEffectState: "followWindow",
    };
  }

  if (process.platform === "win32") {
    return {
      backgroundMaterial: mode === "live" ? "acrylic" : "mica",
    };
  }

  return {};
}

export function getWindowGlassBackground(
  mode: AppGlassMode,
  opaqueBackground: string,
) {
  return mode !== "off" && supportsNativeGlass()
    ? TRANSPARENT_WINDOW_BACKGROUND
    : safeOpaqueBackground(opaqueBackground);
}

export function applyWindowGlass(
  window: BrowserWindow | null,
  requestedMode: unknown,
  opaqueBackground: string,
  appearance?: unknown,
) {
  if (!window || window.isDestroyed()) return;

  const mode = isAppGlassMode(requestedMode) ? requestedMode : "off";
  const background = getWindowGlassBackground(mode, opaqueBackground);
  synchronizeNativeGlassAppearance(mode, appearance);

  try {
    if (process.platform === "darwin") {
      window.setVibrancy(mode === "off" ? null : "under-window");
    } else if (process.platform === "win32") {
      window.setBackgroundMaterial(
        mode === "off" ? "none" : mode === "live" ? "acrylic" : "mica",
      );
    }

    // The BrowserWindow remains a normal opaque, resizable window. Only its
    // native background is cleared while the OS material is active, allowing
    // translucent renderer surfaces to reveal that material without enabling
    // Electron's more fragile full transparent-window mode.
    window.setBackgroundColor(background);
  } catch (error) {
    window.setBackgroundColor(safeOpaqueBackground(opaqueBackground));
    console.warn(
      "Native window glass is unavailable; using an opaque window:",
      error,
    );
  }
}
