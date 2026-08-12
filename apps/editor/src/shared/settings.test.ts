import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  EDITOR_FONT_FAMILIES,
  UI_FONT_FAMILIES,
  normalizeSettings,
} from "./settings";

describe("font settings", () => {
  it("offers every editor font as a UI font", () => {
    const uiFonts = new Set<string>(UI_FONT_FAMILIES);

    for (const fontFamily of EDITOR_FONT_FAMILIES) {
      expect(uiFonts.has(fontFamily)).toBe(true);
    }
  });
});

describe("editor formatting settings", () => {
  it("preserves auto-save and defaults it off for older settings", () => {
    expect(
      normalizeSettings({ editor: { autoSave: true } }).editor.autoSave,
    ).toBe(true);
    expect(normalizeSettings({ editor: {} }).editor.autoSave).toBe(false);
  });

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

describe("application glass settings", () => {
  it("preserves explicit native glass modes", () => {
    expect(
      normalizeSettings({ editor: { appGlassMode: "live" } }).editor
        .appGlassMode,
    ).toBe("live");
  });

  it("migrates the previous transparency toggle to system glass", () => {
    expect(
      normalizeSettings({ editor: { appTransparency: true } }).editor
        .appGlassMode,
    ).toBe("system");
    expect(
      normalizeSettings({ editor: { appTransparency: false } }).editor
        .appGlassMode,
    ).toBe("off");
  });
});

describe("editor suggestion settings", () => {
  it("preserves explicit completion preferences", () => {
    const settings = normalizeSettings({
      editor: {
        quickSuggestionsEnabled: false,
        triggerCharacterSuggestionsEnabled: false,
        suggestionPreviewEnabled: false,
        wordBasedSuggestionsEnabled: false,
      },
    });

    expect(settings.editor).toMatchObject({
      quickSuggestionsEnabled: false,
      triggerCharacterSuggestionsEnabled: false,
      suggestionPreviewEnabled: false,
      wordBasedSuggestionsEnabled: false,
    });
  });

  it("keeps suggestions enabled when older settings omit the preferences", () => {
    const settings = normalizeSettings({ editor: {} });

    expect(settings.editor.quickSuggestionsEnabled).toBe(true);
    expect(settings.editor.triggerCharacterSuggestionsEnabled).toBe(true);
    expect(settings.editor.suggestionPreviewEnabled).toBe(true);
    expect(settings.editor.wordBasedSuggestionsEnabled).toBe(true);
  });
});

describe("line trace settings", () => {
  it("preserves an explicit disabled preference", () => {
    const settings = normalizeSettings({
      editor: { lineTraceEnabled: false },
    });

    expect(settings.editor.lineTraceEnabled).toBe(false);
  });

  it("enables line trace for older settings", () => {
    expect(normalizeSettings({ editor: {} }).editor.lineTraceEnabled).toBe(
      true,
    );
  });
});

describe("terminal settings", () => {
  it("preserves an explicit GPU acceleration mode", () => {
    expect(
      normalizeSettings({ terminal: { gpuAcceleration: "off" } }).terminal
        .gpuAcceleration,
    ).toBe("off");
  });

  it("uses automatic GPU detection for older or invalid settings", () => {
    expect(normalizeSettings({}).terminal.gpuAcceleration).toBe("auto");
    expect(
      normalizeSettings({ terminal: { gpuAcceleration: "canvas" } }).terminal
        .gpuAcceleration,
    ).toBe("auto");
  });
});
