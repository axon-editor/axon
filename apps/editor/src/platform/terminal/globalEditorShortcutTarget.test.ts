import { describe, expect, it } from "vitest";
import { isTerminalShortcutTarget } from "../../renderer/features/editor/shortcuts/useGlobalEditorShortcuts";

describe("global editor shortcut targets", () => {
  it("leaves keyboard events from xterm's input surface to terminal programs", () => {
    const terminal = document.createElement("div");
    terminal.className = "xterm";
    const helperTextarea = document.createElement("textarea");
    helperTextarea.className = "xterm-helper-textarea";
    terminal.appendChild(helperTextarea);

    expect(isTerminalShortcutTarget(helperTextarea)).toBe(true);
    expect(isTerminalShortcutTarget(terminal)).toBe(true);
  });

  it("keeps non-terminal targets available to Axon's editor shortcuts", () => {
    expect(isTerminalShortcutTarget(document.createElement("textarea"))).toBe(
      false,
    );
    expect(isTerminalShortcutTarget(document.body)).toBe(false);
    expect(isTerminalShortcutTarget(null)).toBe(false);
  });
});
