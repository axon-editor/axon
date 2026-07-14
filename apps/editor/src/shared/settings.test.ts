import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("editor formatting settings", () => {
  it("preserves explicit indentation and guide preferences", () => {
    const settings = normalizeSettings({
      editor: {
        tabSize: 4,
        insertSpaces: false,
        detectIndentation: false,
        codePaddingLeft: 32,
        indentationGuidesEnabled: false,
        highlightActiveIndentationGuide: false,
        bracketPairGuidesEnabled: false,
      },
    });

    expect(settings.editor).toMatchObject({
      tabSize: 4,
      insertSpaces: false,
      detectIndentation: false,
      codePaddingLeft: 32,
      indentationGuidesEnabled: false,
      highlightActiveIndentationGuide: false,
      bracketPairGuidesEnabled: false,
    });
  });

  it("clamps numeric layout values and defaults invalid toggles", () => {
    const settings = normalizeSettings({
      editor: {
        tabSize: 99,
        codePaddingLeft: -20,
        insertSpaces: "yes",
        detectIndentation: null,
      },
    });

    expect(settings.editor.tabSize).toBe(8);
    expect(settings.editor.codePaddingLeft).toBe(0);
    expect(settings.editor.insertSpaces).toBe(
      DEFAULT_SETTINGS.editor.insertSpaces,
    );
    expect(settings.editor.detectIndentation).toBe(
      DEFAULT_SETTINGS.editor.detectIndentation,
    );
  });
});
