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

function opaqueThemeColor(color: string) {
  const match = color.trim().match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  return match ? `#${match[1]}` : color;
}

export function resolveThemeGitColors(
  tokens: ThemeTokenMap,
  appearance: ThemeAppearance,
) {
  const added = opaqueThemeColor(tokens["syntax.string"]);
  const modified = opaqueThemeColor(tokens["syntax.number"]);
  const deleted = opaqueThemeColor(tokens["syntax.constant"]);
  const mixed = opaqueThemeColor(tokens["syntax.function"]);

  // Git state should belong to the selected theme, but destructive backgrounds
  // still need less visual weight than their foreground. Mixing the theme's
  // own deleted color into its panel surface preserves that palette and keeps
  // the result readable on both pale and dark themes.
  return {
    added,
    modified,
    deleted,
    mixed,
    dangerBackground: `color-mix(in srgb, ${deleted} ${appearance === "light" ? 12 : 18}%, ${tokens["panel.background"]})`,
  };
}

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

export function appearanceBorderColor(
  color: string,
  appearance: ThemeAppearance,
  opacity = 1,
) {
  const normalizedColor = color.trim();
  const match = normalizedColor.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i,
  );
  if (!match) return color;
  if (appearance === "light" && opacity >= 1) return color;

  const [, red, green, blue, existingAlpha] = match;
  const baseAlpha = existingAlpha
    ? Number.parseInt(existingAlpha, 16) / 255
    : 1;
  // Dark editor surfaces need structure without a bright rectangle around
  // every control. Multiplying the theme's own alpha keeps its hue and relative
  // strength intact while making separators recede behind text and content.
  // Light themes keep their authored contrast because faint pale borders can
  // disappear completely against white or parchment backgrounds.
  const appearanceMultiplier = appearance === "dark" ? 0.4 : 1;
  const finalAlpha = Math.max(
    0,
    Math.min(1, baseAlpha * opacity * appearanceMultiplier),
  );
  const alphaHex = Math.round(finalAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${red}${green}${blue}${alphaHex}`;
}
