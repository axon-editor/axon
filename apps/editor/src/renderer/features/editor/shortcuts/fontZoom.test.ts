import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../shared/settings";
import { settingsFromEditorFontZoomShortcut } from "./fontZoom";

function keyboardEvent(key: string) {
  return new KeyboardEvent("keydown", { key, metaKey: true });
}

describe("editor font zoom", () => {
  it("zooms font size and line height in together", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      editor: {
        ...DEFAULT_SETTINGS.editor,
        fontSize: 14,
        lineHeight: 22,
      },
    };

    const result = settingsFromEditorFontZoomShortcut(
      keyboardEvent("+"),
      settings,
    );

    expect(result?.editor.fontSize).toBe(15);
    expect(result?.editor.lineHeight).toBe(24);
  });

  it("zooms font size and line height out together", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      editor: {
        ...DEFAULT_SETTINGS.editor,
        fontSize: 14,
        lineHeight: 22,
      },
    };

    const result = settingsFromEditorFontZoomShortcut(
      keyboardEvent("-"),
      settings,
    );

    expect(result?.editor.fontSize).toBe(13);
    expect(result?.editor.lineHeight).toBe(20);
  });

  it("does not move beyond the editor font limits", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      editor: {
        ...DEFAULT_SETTINGS.editor,
        fontSize: 28,
      },
    };

    expect(
      settingsFromEditorFontZoomShortcut(keyboardEvent("+"), settings),
    ).toBeNull();
  });
});
