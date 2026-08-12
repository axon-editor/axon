import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
} from "electron";
import { isAppGlassMode, type AppGlassMode } from "../../shared/settings";

const TRANSPARENT_WINDOW_BACKGROUND = "#00000000";

function supportsNativeGlass() {
  return process.platform === "darwin" || process.platform === "win32";
}

function safeOpaqueBackground(background: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(background)
    ? background.slice(0, 7)
    : "#0e1018";
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
) {
  if (!window || window.isDestroyed()) return;

  const mode = isAppGlassMode(requestedMode) ? requestedMode : "off";
  const background = getWindowGlassBackground(mode, opaqueBackground);

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
