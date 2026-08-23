import { describe, expect, it } from "vitest";
import {
  appearanceBorderColor,
  gitAppearanceColors,
  inferThemeAppearance,
  resolveThemeGitColors,
} from "./themeAppearance";

function luminance(color: string) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("theme appearance colors", () => {
  it("detects Parchment-style backgrounds as light", () => {
    expect(inferThemeAppearance({ "editor.background": "#fff7d2" })).toBe(
      "light",
    );
  });

  it("detects dark editor backgrounds as dark", () => {
    expect(inferThemeAppearance({ "editor.background": "#0d1016" })).toBe(
      "dark",
    );
  });

  it("keeps light and dark Git paints distinct", () => {
    expect(gitAppearanceColors.light.added).not.toBe(
      gitAppearanceColors.dark.added,
    );
    expect(gitAppearanceColors.light.deleted).not.toBe(
      gitAppearanceColors.dark.deleted,
    );
  });

  it("keeps every light Git paint readable on Parchment", () => {
    for (const color of [
      gitAppearanceColors.light.added,
      gitAppearanceColors.light.modified,
      gitAppearanceColors.light.deleted,
      gitAppearanceColors.light.mixed,
    ]) {
      expect(contrastRatio(color, "#fff7d2")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("resolves Git paint from fixed semantic palettes", () => {
    expect(resolveThemeGitColors("light")).toBe(gitAppearanceColors.light);
    expect(resolveThemeGitColors("dark")).toBe(gitAppearanceColors.dark);
  });

  it("softens dark UI borders without weakening light theme borders", () => {
    expect(appearanceBorderColor("#222838", "dark")).toBe("#22283866");
    expect(appearanceBorderColor("#00000033", "dark")).toBe("#00000014");
    expect(appearanceBorderColor("#c9bf96", "light")).toBe("#c9bf96");
  });
});
