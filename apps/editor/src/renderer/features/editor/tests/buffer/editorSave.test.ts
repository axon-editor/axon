import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AXON_EDITOR_SAVE_EVENT,
  dispatchEditorSave,
  type EditorSaveEventDetail,
} from "../../lib/buffer/editorSave";

describe("editor save dispatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports when the active editor claims the save", () => {
    const listener = (event: Event) => {
      const saveEvent = event as CustomEvent<EditorSaveEventDetail>;
      expect(saveEvent.detail.path).toBe("/workspace/main.ts");
      saveEvent.preventDefault();
    };
    window.addEventListener(AXON_EDITOR_SAVE_EVENT, listener);

    expect(dispatchEditorSave("/workspace/main.ts")).toBe(true);

    window.removeEventListener(AXON_EDITOR_SAVE_EVENT, listener);
  });

  it("lets the app shell fall back when no editor is mounted", () => {
    expect(dispatchEditorSave("/workspace/main.ts")).toBe(false);
  });
});
