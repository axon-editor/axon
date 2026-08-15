import type { CSSProperties } from "react";
import type { ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import type { ThemeAppearance } from "../../../renderer/shared/themes/themeAppearance";

function colorWithAlpha(color: string, alpha: number) {
  const normalizedColor = color.trim();
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

function opaqueColor(color: string) {
  const normalizedColor = color.trim();
  const match = normalizedColor.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  return match ? `#${match[1]}` : color;
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
  // second tint and defeats the purpose of revealing that material. Every
  // long-lived renderer surface therefore stays completely transparent; the
  // main process aligns the native material's light/dark appearance with the
  // selected theme so that themed text remains readable without a CSS wash.
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
    "--axon-background": "transparent",
    "--axon-title-bar-background": "transparent",
    "--axon-toolbar-background": "transparent",
    "--axon-sidebar-background": "transparent",
    "--axon-sidebar-hover-background": neutralHover,
    "--axon-sidebar-border": neutralBorder,
    "--axon-tab-active-background": neutralHover,
    "--axon-panel-background": "transparent",
    "--axon-panel-border": neutralBorder,
    "--axon-panel-overlay-hover": neutralHover,
    "--axon-status-bar-background": "transparent",
    "--axon-editor-background": "transparent",
    "--axon-editor-gutter-background": "transparent",
    "--axon-terminal-background": "transparent",
  } as CSSProperties;
}
