import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import type { ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import { createGlassThemeCssVariables } from "./glassTheme";

const parchmentTokens = {
  background: "#d9c8a4ff",
  "sidebar.background": "#ecdcb3ff",
  "panel.background": "#ecdcb3ff",
  "editor.background": "#f2e5bcff",
} as ResolvedThemeTokens;

describe("glass theme surfaces", () => {
  it("removes theme tint from persistent light-theme surfaces", () => {
    const variables = createGlassThemeCssVariables(
      { "--axon-editor-foreground": "#282828ff" } as CSSProperties,
      parchmentTokens,
      "light",
      0.88,
      10,
    ) as Record<string, string>;

    expect(variables).toMatchObject({
      "--axon-background": "transparent",
      "--axon-title-bar-background": "transparent",
      "--axon-sidebar-background": "transparent",
      "--axon-panel-background": "transparent",
      "--axon-editor-background": "transparent",
      "--axon-editor-gutter-background": "transparent",
      "--axon-terminal-background": "transparent",
      "--axon-editor-foreground": "#282828ff",
      "--axon-glass-surface-saturation": "100%",
    });
    expect(variables["--axon-sidebar-hover-background"]).toBe(
      "rgba(255, 255, 255, 0.24)",
    );
    expect(variables["--axon-modal-glass-background"]).toContain(
      "242, 229, 188",
    );
  });

  it("uses neutral dark interaction layers instead of theme backgrounds", () => {
    const variables = createGlassThemeCssVariables(
      {},
      {
        ...parchmentTokens,
        "panel.background": "#111827",
        "editor.background": "#0b1020",
      },
      "dark",
      0.8,
      12,
    ) as Record<string, string>;

    expect(variables["--axon-panel-background"]).toBe("transparent");
    expect(variables["--axon-background"]).toBe("transparent");
    expect(variables["--axon-panel-border"]).toBe(
      "rgba(255, 255, 255, 0.10)",
    );
    expect(variables["--axon-panel-overlay-hover"]).toBe(
      "rgba(255, 255, 255, 0.08)",
    );
  });
});
