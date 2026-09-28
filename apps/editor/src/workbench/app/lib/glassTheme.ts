/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CSSProperties } from "react";
import type { ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import type { ThemeAppearance } from "../../../renderer/shared/themes/themeAppearance";

function colorWithAlpha(color: string, alpha: number) {
  const normalizedColor = color?.trim() ?? "";
  const match = normalizedColor.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i,
  );
  if (!match) return color;

  const [, red, green, blue, existingAlpha] = match;
  const baseAlpha = existingAlpha
    ? Number.parseInt(existingAlpha, 16) / 255
    : 1;
  const finalAlpha = Math.max(0, Math.min(1, alpha * baseAlpha));
  return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${finalAlpha})`;
}

// A fully transparent renderer surface leaves Chromium with no stable backdrop
// to damage against. A hover that dirties one small rectangle then composites
// that region against a stale snapshot, which shows up as a ghost of the
// previous frame stacked under the new one until something forces a full
// repaint, such as resizing the window. MonoCode hits the same failure in
// WKWebView and answers it by putting a nearly transparent AppKit view behind
// the web content rather than by filtering inside it. Same reasoning applies
// here: this alpha is far too low to tint the native material visibly, but it
// gives the compositor an actual surface to repaint against.
const GLASS_SURFACE_ALPHA = 0.01;

function opaqueColor(color: string) {
  const normalizedColor = color?.trim() ?? "";
  const match = normalizedColor.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  return match ? `#${match[1]}` : color;
}

// colorWithAlpha passes any value it cannot parse through untouched, which
// would leave a theme that already resolves to `transparent` fully clear and
// reintroduce the ghosting. Fall back to a neutral of the right appearance so
// every persistent surface ends up with a nonzero alpha regardless of how the
// theme authored its color.
function glassSurface(color: string, lightGlass: boolean) {
  const tinted = colorWithAlpha(color, GLASS_SURFACE_ALPHA);
  const authored =
    typeof color === "string" &&
    /^(#([0-9a-f]{2}){3,4}|rgba?\()/.test(color.trim());
  return authored
    ? tinted
    : colorWithAlpha(lightGlass ? "#ffffff" : "#000000", GLASS_SURFACE_ALPHA);
}

export function createGlassThemeCssVariables(
  themeCssVariables: CSSProperties,
  themeTokens: ResolvedThemeTokens,
  themeAppearance: ThemeAppearance,
  opacity: number,
  blur: number,
) {
  const lightGlass = themeAppearance === "light";
  const modalOpacity = lightGlass
    ? Math.max(0.9, Math.min(0.96, opacity + 0.12))
    : Math.max(0.78, Math.min(0.9, opacity + 0.04));
  const popupOpacity = lightGlass
    ? Math.max(0.94, Math.min(0.98, opacity + 0.14))
    : Math.max(0.86, Math.min(0.96, opacity + 0.08));
  const neutralHover = lightGlass
    ? "rgba(255, 255, 255, 0.24)"
    : "rgba(255, 255, 255, 0.08)";
  const neutralBorder = lightGlass
    ? "rgba(0, 0, 0, 0.14)"
    : "rgba(255, 255, 255, 0.10)";
  // Native vibrancy and material already own the persistent application
  // surface. Applying translucent theme or neutral colors on top creates a
  // second tint and defeats the purpose of revealing that material. These
  // surfaces therefore stay at a barely-there alpha of their own theme color:
  // visually indistinguishable from clear once composited over the OS
  // material, but opaque enough that the compositor always has a real surface
  // to repaint when a hover dirties a small region. The main process aligns
  // the native material's light/dark appearance with the selected theme so
  // that themed text remains readable without a CSS wash.
  return {
    ...themeCssVariables,
    "--axon-glass-surface-blur": `${blur * 2}px`,
    "--axon-glass-surface-saturation": "100%",
    "--axon-modal-glass-background": colorWithAlpha(
      themeTokens["editor.background"],
      modalOpacity,
    ),
    "--axon-modal-overlay-background": lightGlass
      ? "rgba(255, 255, 255, 0.10)"
      : "rgba(0, 0, 0, 0.18)",
    "--axon-popup-background": colorWithAlpha(
      themeTokens["panel.background"],
      popupOpacity,
    ),
    "--axon-solid-popup-background": opaqueColor(
      themeTokens["panel.background"],
    ),
    "--axon-background": glassSurface(themeTokens.background, lightGlass),
    "--axon-title-bar-background": glassSurface(
      themeTokens["title_bar.background"],
      lightGlass,
    ),
    "--axon-toolbar-background": glassSurface(
      themeTokens["toolbar.background"],
      lightGlass,
    ),
    "--axon-sidebar-background": glassSurface(
      themeTokens["sidebar.background"],
      lightGlass,
    ),
    "--axon-sidebar-hover-background": neutralHover,
    "--axon-sidebar-border": neutralBorder,
    "--axon-tab-active-background": neutralHover,
    "--axon-panel-background": glassSurface(
      themeTokens["panel.background"],
      lightGlass,
    ),
    "--axon-panel-border": neutralBorder,
    "--axon-panel-overlay-hover": neutralHover,
    "--axon-status-bar-background": glassSurface(
      themeTokens["status_bar.background"],
      lightGlass,
    ),
    "--axon-editor-background": glassSurface(
      themeTokens["editor.background"],
      lightGlass,
    ),
    "--axon-editor-gutter-background": glassSurface(
      themeTokens["editor.gutter.background"],
      lightGlass,
    ),
    "--axon-terminal-background": glassSurface(
      themeTokens["terminal.background"],
      lightGlass,
    ),
  } as CSSProperties;
}
