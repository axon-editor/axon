import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@axon-editor/shared/settings";
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
});
