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

  it("normalizes Axon Parchment as a complete light theme", () => {
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
    expect(theme.tokens["editor.background"]).toBe("#fff7d2");
    expect(theme.tokens["panel.border"]).toBe("#c9bf96");
    expect(theme.syntax.comment).toMatchObject({
      color: "#766e5b",
      fontStyle: "italic",
    });
    expect(theme.syntax.string).toMatchObject({
      color: "#77732f",
      fontStyle: "italic",
    });

    const editorBackground = theme.tokens["editor.background"]!;
    for (const style of Object.values(theme.syntax)) {
      if (style.color) {
        expect(
          contrastRatio(style.color, editorBackground),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
