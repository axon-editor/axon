/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ThemeTokenMap } from "./types";

// The settings surface (toggles, sliders, active nav) needs a single accent it
// can trust across every theme, but Axon deliberately has no "accent" color
// token to keep the theme contract small. Rather than inventing a new
// ThemeColorToken that every built-in theme and user override would have to
// define, I derive the accent from the editor's syntax.function token: it is
// already present in every theme, usually maps to a readable blue/teal, and it
// follows user theme_overrides indirectly, so overriding syntax.function moves
// the whole accent family at once.
//
// The browser still needs a foreground that contrasts with that accent for
// toggle knobs and active glyphs. I flip between a near-black and near-white
// text based on the accent's relative luminance, so a bright cyan accent gets
// dark control marks and a dark navy accent gets light ones without depending
// on whether the surrounding theme itself is light or dark.

export interface ThemeAccent {
  accent: string;
  accentForeground: string;
  accentMuted: string;
}

interface RgbChannels {
  red: number;
  green: number;
  blue: number;
}

function parseRgbChannels(color: string): RgbChannels | null {
  const match = color
    .trim()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;

  let hex = match[1];
  // Shorthand #rgb/#rgba expands to the doubled #rrggbb/#rrggbbaa form so the
  // channel math below only has to understand 6 and 8 digit input.
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((channel) => channel + channel).join("");
  }

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function relativeLuminance({ red, green, blue }: RgbChannels) {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return (
    linearize(red) * 0.2126 +
    linearize(green) * 0.7152 +
    linearize(blue) * 0.0722
  );
}

// The fallback is a calm steel blue used only when a theme supplies a color in
// an unparseable form. Since createThemeCssVariables already normalizes every
// token, reaching this branch means a third-party theme sent something exotic;
// keep rendering rather than failing the whole application.
const FALLBACK_ACCENT: RgbChannels = { red: 96, green: 160, blue: 200 };

export function resolveThemeAccent(
  tokens: Pick<ThemeTokenMap, "syntax.function">,
): ThemeAccent {
  const channels = parseRgbChannels(tokens["syntax.function"]) ?? FALLBACK_ACCENT;
  const luminance = relativeLuminance(channels);
  const accentForeground = luminance > 0.45 ? "#101010" : "#f2f6fa";
  const accentMuted = `rgba(${channels.red}, ${channels.green}, ${channels.blue}, 0.14)`;

  return {
    accent: tokens["syntax.function"],
    accentForeground,
    accentMuted,
  };
}