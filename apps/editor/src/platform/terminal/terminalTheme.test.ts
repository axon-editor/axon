import { describe, expect, it } from "vitest";
import type { EditorSettings } from "../../shared/settings";
import type { ResolvedThemeTokens } from "../../renderer/shared/lib/themeTokens";
import { getTerminalOptions } from "./terminalTheme";

const themeTokens = {
  "terminal.background": "#f2e5bcff",
  "terminal.foreground": "#282828ff",
} as ResolvedThemeTokens;

function createSettings(appGlassMode: EditorSettings["appGlassMode"]) {
  return {
    appGlassMode,
    themeId: "axon-parchment",
    fontFamily: "JetBrains Mono",
    fontWeight: 400,
    fontSize: 14,
    lineHeight: 21,
  } as EditorSettings;
}

describe("terminal glass theme", () => {
  it("clears the xterm canvas background while Glass is active", () => {
    const options = getTerminalOptions(createSettings("system"), themeTokens);

    expect(options.theme.background).toBe("#00000000");
    expect(options.theme.foreground).toBe("#282828ff");
  });

  it("keeps the theme background when Glass is disabled", () => {
    const options = getTerminalOptions(createSettings("off"), themeTokens);

    expect(options.theme.background).toBe("#f2e5bcff");
  });
});
