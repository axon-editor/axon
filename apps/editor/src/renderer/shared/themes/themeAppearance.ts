import type { ThemeTokenMap } from "./types";

export type ThemeAppearance = "light" | "dark";

export const gitAppearanceColors = {
  light: {
    added: "#1f6f3d",
    modified: "#8a4f00",
    deleted: "#b42318",
    mixed: "#136b7a",
    dangerBackground: "#f7d9d5",
  },
  dark: {
    added: "#56d38b",
    modified: "#e5b95c",
    deleted: "#ff7b72",
    mixed: "#80c8e0",
    dangerBackground: "#2a1517",
  },
} as const;

export function inferThemeAppearance(
  tokens: Pick<ThemeTokenMap, "editor.background">,
): ThemeAppearance {
  const match = tokens["editor.background"].match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,
  );
  if (!match) return "dark";

  const channels = match.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.45 ? "light" : "dark";
}
