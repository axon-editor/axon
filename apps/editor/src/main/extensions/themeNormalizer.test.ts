import path from "node:path";
import { describe, expect, it } from "vitest";
import { readExtensionTheme } from "./themeNormalizer";

function relativeLuminance(color: string) {
  const channels = color
    .slice(1, 7)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe("built-in Axon themes", () => {
  it.each([
    ["axon-black", "Axon Black", "dark", "#000000"],
    ["axon-white", "Axon White", "light", "#ffffff"],
  ] as const)(
    "normalizes %s with complete high-contrast surfaces",
    (themeId, label, appearance, surface) => {
      const [theme] = readExtensionTheme(
        "axon.themes",
        "Axon Themes",
        themeId,
        label,
        path.resolve(
          process.cwd(),
          "..",
          "..",
          "extensions",
          "builtin",
          "themes",
          "axon",
          "themes",
          `${themeId}.json`,
        ),
      );

      expect(theme).toMatchObject({ id: themeId, label, appearance });
      expect(theme.tokens["editor.background"]).toBe(surface);
      expect(theme.tokens["terminal.background"]).toBe(surface);
      expect(theme.tokens["sidebar.background"]).toBe(surface);

      for (const style of Object.values(theme.syntax)) {
        if (style.color) {
          expect(contrastRatio(style.color, surface)).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
    },
  );

  it("normalizes the Zed-compatible Axon Parchment replacement", () => {
    const [theme] = readExtensionTheme(
      "axon.themes",
      "Axon Themes",
      "axon-parchment",
      "Axon Parchment",
      path.resolve(
        process.cwd(),
        "..",
        "..",
        "extensions",
        "builtin",
        "themes",
        "axon",
        "themes",
        "axon-parchment.json",
      ),
    );

    expect(theme).toMatchObject({
      id: "axon-parchment",
      label: "Axon Parchment",
      appearance: "light",
    });
    expect(theme.tokens["editor.background"]).toBe("#f2e5bcff");
    expect(theme.tokens["panel.background"]).toBe("#ecdcb3ff");
    expect(theme.tokens["panel.border"]).toBe("#c8b899ff");
    expect(theme.syntax.comment).toMatchObject({
      color: "#7c6f64ff",
    });
    expect(theme.syntax.string).toMatchObject({
      color: "#79740eff",
    });
    expect(theme.monaco).toMatchObject({
      "editor.lineHighlightBackground": "#ecdcb3bf",
      "editorLineNumber.foreground": "#a9a389",
    });
  });

  it.each([
    ["blank-ghibli", "Blank Ghibli", "blank-ghibli.json", 1],
    ["sequoia", "Sequoia", "sequoia.json", 6],
    ["snowfall", "Snowfall", "snowfall.json", 4],
    ["uniform-midnight", "Uniform Midnight", "uniform.json", 1],
    ["vitesse-refined", "Vitesse Refined", "vitesse-refined.json", 5],
  ] as const)(
    "loads every %s collection variant",
    (contributionId, contributionLabel, fileName, expectedCount) => {
      const themes = readExtensionTheme(
        `axon.${contributionId}-theme`,
        contributionLabel,
        contributionId,
        contributionLabel,
        path.resolve(
          process.cwd(),
          "..",
          "..",
          "extensions",
          "builtin",
          "themes",
          contributionId === "uniform-midnight" ? "uniform" : contributionId,
          "themes",
          fileName,
        ),
      );

      expect(themes).toHaveLength(expectedCount);
      for (const theme of themes) {
        expect(theme.tokens["editor.background"]).toMatch(/^#[0-9a-f]{6,8}$/i);
        expect(theme.tokens["editor.foreground"]).toMatch(/^#[0-9a-f]{6,8}$/i);
        expect(theme.tokens["panel.background"]).toMatch(/^#[0-9a-f]{6,8}$/i);
      }
    },
  );

  it("expands shorthand Zed colors and resolves null inherited surfaces", () => {
    const [, vitesseBlack, , vitesseDarkSoft] = readExtensionTheme(
      "axon.vitesse-refined-theme",
      "Vitesse Refined",
      "vitesse-refined",
      "Vitesse Refined",
      path.resolve(
        process.cwd(),
        "..",
        "..",
        "extensions",
        "builtin",
        "themes",
        "vitesse-refined",
        "themes",
        "vitesse-refined.json",
      ),
    );
    const [uniform] = readExtensionTheme(
      "axon.uniform-theme",
      "Uniform",
      "uniform-midnight",
      "Uniform Midnight",
      path.resolve(
        process.cwd(),
        "..",
        "..",
        "extensions",
        "builtin",
        "themes",
        "uniform",
        "themes",
        "uniform.json",
      ),
    );
    const [, snowfallWithBackground] = readExtensionTheme(
      "axon.snowfall-theme",
      "Snowfall",
      "snowfall",
      "Snowfall",
      path.resolve(
        process.cwd(),
        "..",
        "..",
        "extensions",
        "builtin",
        "themes",
        "snowfall",
        "themes",
        "snowfall.json",
      ),
    );

    expect(vitesseBlack.tokens["editor.background"]).toBe("#000000");
    expect(vitesseDarkSoft.tokens["editor.background"]).toBe("#222222");
    expect(uniform.tokens).toMatchObject({
      background: "#030309",
      "editor.background": "#030309",
      "editor.foreground": "#ffffffe0",
      "panel.background": "#030309",
    });
    expect(uniform.syntax.link_text).toMatchObject({ underline: true });
    expect(snowfallWithBackground.syntax.character).toMatchObject({
      backgroundColor: "#74968933",
    });
  });
});
