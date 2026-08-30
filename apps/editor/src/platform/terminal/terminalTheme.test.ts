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

describe("contributed terminal colors", () => {
  it("maps a Zed ANSI palette into xterm's theme", () => {
    const options = getTerminalOptions(createSettings("off"), themeTokens, {
      "ansi.red": "#cc241dff",
      "ansi.bright_blue": "#83a598ff",
    });

    expect(options.theme.red).toBe("#cc241dff");
    expect(options.theme.brightBlue).toBe("#83a598ff");
  });

  it("accepts VS Code terminal color names from native themes", () => {
    const options = getTerminalOptions(createSettings("off"), themeTokens, {
      "terminal.ansiGreen": "#15ac91",
      "terminal.selectionBackground": "#264f7880",
      "terminalCursor.foreground": "#ffffff",
    });

    expect(options.theme.green).toBe("#15ac91");
    expect(options.theme.selectionBackground).toBe("#264f7880");
    expect(options.theme.cursor).toBe("#ffffff");
  });

  it("keeps resolved background and foreground overrides authoritative", () => {
    const options = getTerminalOptions(createSettings("off"), themeTokens, {
      background: "#000000",
      foreground: "#ffffff",
      red: "#cc241dff",
    });

    expect(options.theme.background).toBe("#f2e5bcff");
    expect(options.theme.foreground).toBe("#282828ff");
    expect(options.theme.red).toBe("#cc241dff");
  });
});
