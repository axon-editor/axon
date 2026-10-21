/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  nativeTheme,
} from "electron";
import { isAppGlassMode, type AppGlassMode } from "../../../shared/core/settings";

const TRANSPARENT_WINDOW_BACKGROUND = "#00000000";
type NativeGlassAppearance = "light" | "dark";

// Electron exposes setVibrancy(), but macOS does not rebuild the underlying
// NSVisualEffectView when a window that started opaque becomes vibrant. Keep
// the last requested mode per native window so that transition can explicitly
// discard the old backing surface instead of letting Chromium damage against
// its stale snapshot.
const appliedGlassModes = new WeakMap<BrowserWindow, AppGlassMode>();

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
  const previousMode = appliedGlassModes.get(window);
  const isEnablingMacGlass =
    process.platform === "darwin" &&
    previousMode === "off" &&
    mode !== "off";
  synchronizeNativeGlassAppearance(mode, appearance);

  try {
    if (process.platform === "darwin") {
      if (isEnablingMacGlass) {
        // A window initially created without vibrancy retains its opaque
        // AppKit backing layer when Electron enables it later. Clearing the
        // effect and restoring an opaque color first makes macOS allocate a
        // new material layer before Chromium receives its transparent Glass
        // surface. Without this sequence, hover damage can reveal old frames.
        window.setVibrancy(null);
        window.setBackgroundColor(safeOpaqueBackground(opaqueBackground));
      }
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
    appliedGlassModes.set(window, mode);

    if (isEnablingMacGlass) {
      // The native layer is new, but Chromium may still hold a partial damage
      // region from the opaque frame. Invalidate the full WebContents only on
      // this transition so the first Glass frame is submitted as one surface.
      window.webContents.invalidate();
    }
  } catch (error) {
    window.setBackgroundColor(safeOpaqueBackground(opaqueBackground));
    console.warn(
      "Native window glass is unavailable; using an opaque window:",
      error,
    );
  }
}
