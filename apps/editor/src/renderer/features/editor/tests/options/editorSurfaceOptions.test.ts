/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@axon-editor/shared/core/settings";
import { createEditorSurfaceOptions } from "../../lib/options/editorSurfaceOptions";

describe("editor surface options", () => {
  it("keeps hover widgets inside the editor viewport and prefers the top by default", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: DEFAULT_SETTINGS.editor,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.allowOverflow).toBe(false);
    expect(options.fixedOverflowWidgets).toBe(false);
    expect(options.hover).toMatchObject({
      enabled: "on",
      above: true,
    });
  });

  it("lets the user prefer hover widgets below the current line", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: {
        ...DEFAULT_SETTINGS.editor,
        hoverPlacement: "bottom",
      },
      largeDocument: false,
      readOnly: false,
    });

    expect(options.hover).toMatchObject({
      enabled: "on",
      above: false,
    });
  });

  it("keeps the top preference when hot reload retains an older settings object", () => {
    const editorSettings = { ...DEFAULT_SETTINGS.editor };
    delete (editorSettings as Partial<typeof editorSettings>).hoverPlacement;

    const options = createEditorSurfaceOptions({
      editorSettings,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.hover).toMatchObject({
      enabled: "on",
      above: true,
    });
  });

  it("disables hovers with Monaco's current option value for large documents", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: DEFAULT_SETTINGS.editor,
      largeDocument: true,
      readOnly: false,
    });

    expect(options.hover).toMatchObject({ enabled: "off" });
  });

  it("enables Monaco native inline suggestions for normal documents", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: DEFAULT_SETTINGS.editor,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.inlineSuggest).toMatchObject({
      enabled: true,
      mode: "prefix",
      suppressSuggestions: false,
    });
  });

  it("maps the suggest widget fields to editor settings with inline details on by default", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: DEFAULT_SETTINGS.editor,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.suggest).toMatchObject({
      showSnippets: true,
      snippetsPreventQuickSuggestions: false,
      showInlineDetails: true,
      showStatusBar: false,
      preview: true,
    });
  });

  it("lets the user disable the inline signature and enable the status bar", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: {
        ...DEFAULT_SETTINGS.editor,
        suggestShowInlineDetails: false,
        suggestShowStatusBar: true,
        snippetsPreventQuickSuggestions: true,
        suggestionPreviewEnabled: false,
        snippetsEnabled: false,
      },
      largeDocument: false,
      readOnly: false,
    });

    expect(options.suggest).toMatchObject({
      showSnippets: false,
      snippetsPreventQuickSuggestions: true,
      showInlineDetails: false,
      showStatusBar: true,
      preview: false,
    });
  });

  it("disables inline suggestions for large documents", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: DEFAULT_SETTINGS.editor,
      largeDocument: true,
      readOnly: false,
    });

    expect(options.inlineSuggest).toMatchObject({ enabled: false });
  });

  it("uses the configured code top spacing", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: {
        ...DEFAULT_SETTINGS.editor,
        codePaddingTop: 28,
      },
      largeDocument: false,
      readOnly: false,
    });

    expect(options.padding).toEqual({ top: 28 });
  });

  it("keeps the established top spacing when hot reload has no value yet", () => {
    const editorSettings = { ...DEFAULT_SETTINGS.editor };
    delete (editorSettings as Partial<typeof editorSettings>).codePaddingTop;

    const options = createEditorSurfaceOptions({
      editorSettings,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.padding).toEqual({ top: 16 });
  });

  it("removes the active line band when the user turns it off", () => {
    const options = createEditorSurfaceOptions({
      editorSettings: {
        ...DEFAULT_SETTINGS.editor,
        activeLineHighlightEnabled: false,
      },
      largeDocument: false,
      readOnly: false,
    });

    expect(options.renderLineHighlight).toBe("none");
  });

  it("keeps the active line band off for older settings objects", () => {
    const editorSettings = { ...DEFAULT_SETTINGS.editor };
    delete (editorSettings as Partial<typeof editorSettings>)
      .activeLineHighlightEnabled;

    const options = createEditorSurfaceOptions({
      editorSettings,
      largeDocument: false,
      readOnly: false,
    });

    expect(options.renderLineHighlight).toBe("none");
  });
});
