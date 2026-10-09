/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import type { ResolvedThemeTokens } from "../../../../renderer/shared/lib/theme/themeTokens";
import { createGlassThemeCssVariables } from "./glassTheme";

const parchmentTokens = {
  background: "#d9c8a4ff",
  "title_bar.background": "#d9c8a4ff",
  "toolbar.background": "#d9c8a4ff",
  "sidebar.background": "#ecdcb3ff",
  "status_bar.background": "#d9c8a4ff",
  "panel.background": "#ecdcb3ff",
  "editor.background": "#f2e5bcff",
  "editor.gutter.background": "#f2e5bcff",
  "terminal.background": "#f2e5bcff",
} as ResolvedThemeTokens;

// A fully clear surface is what the compositor bug needs, so every persistent
// surface has to land on a nonzero alpha. rgba() also has to be parsed out of
// the string rather than compared for equality.
function alphaOf(value: string) {
  const match = value.match(
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/,
  );
  if (!match) return null;
  return Number.parseFloat(match[1]);
}

describe("glass theme surfaces", () => {
  it("keeps persistent surfaces barely tinted instead of fully clear", () => {
    const variables = createGlassThemeCssVariables(
      { "--axon-editor-foreground": "#282828ff" } as CSSProperties,
      parchmentTokens,
      "light",
      0.88,
      10,
    ) as Record<string, string>;

    expect(variables).toMatchObject({
      "--axon-editor-foreground": "#282828ff",
      "--axon-glass-surface-saturation": "100%",
    });

    const persistentSurfaces = [
      "--axon-background",
      "--axon-title-bar-background",
      "--axon-toolbar-background",
      "--axon-sidebar-background",
      "--axon-status-bar-background",
      "--axon-panel-background",
      "--axon-editor-background",
      "--axon-editor-gutter-background",
      "--axon-terminal-background",
    ];

    for (const variable of persistentSurfaces) {
      const alpha = alphaOf(variables[variable]);
      expect(alpha, `${variable} was ${variables[variable]}`).toBeGreaterThan(
        0,
      );
      expect(
        alpha,
        `${variable} should stay imperceptible`,
      ).toBeLessThanOrEqual(0.02);
    }

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

    expect(alphaOf(variables["--axon-panel-background"])).toBeGreaterThan(0);
    expect(alphaOf(variables["--axon-background"])).toBeGreaterThan(0);
    expect(variables["--axon-panel-border"]).toBe("rgba(255, 255, 255, 0.10)");
    expect(variables["--axon-panel-overlay-hover"]).toBe(
      "rgba(255, 255, 255, 0.08)",
    );
  });

  it("falls back to a neutral tint when a theme omits or clears a surface", () => {
    const variables = createGlassThemeCssVariables(
      {},
      {
        ...parchmentTokens,
        "editor.background": "transparent",
        "terminal.background": undefined as unknown as string,
      },
      "dark",
      0.8,
      12,
    ) as Record<string, string>;

    // transparent is a real authored value, so it must not pass through as-is.
    expect(variables["--axon-editor-background"]).not.toBe("transparent");
    expect(alphaOf(variables["--axon-editor-background"])).toBeGreaterThan(0);
    expect(alphaOf(variables["--axon-terminal-background"])).toBeGreaterThan(0);
  });
});
