/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from "vitest";
import {
  isTerminalCommandChord,
  isTerminalShortcutTarget,
} from "../../../renderer/features/editor/shortcuts/useGlobalEditorShortcuts";

function setPlatform(platform: string) {
  Object.defineProperty(window, "axon", {
    value: { platform },
    configurable: true,
  });
}

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent("keydown", init);
}

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

describe("macOS command chords over the terminal", () => {
  afterEach(() => {
    delete (window as { axon?: unknown }).axon;
  });

  it("lets Cmd chords through so sidebar and save keep working", () => {
    setPlatform("darwin");
    expect(isTerminalCommandChord(keyEvent({ key: "b", metaKey: true }))).toBe(
      true,
    );
  });

  it("leaves Ctrl and mixed chords to the terminal", () => {
    setPlatform("darwin");
    expect(isTerminalCommandChord(keyEvent({ key: "b", ctrlKey: true }))).toBe(
      false,
    );
    expect(
      isTerminalCommandChord(keyEvent({ key: "b", metaKey: true, ctrlKey: true })),
    ).toBe(false);
    expect(
      isTerminalCommandChord(keyEvent({ key: "b", metaKey: true, altKey: true })),
    ).toBe(false);
    expect(isTerminalCommandChord(keyEvent({ key: "b" }))).toBe(false);
  });

  it("does not claim command chords on other platforms", () => {
    setPlatform("win32");
    expect(isTerminalCommandChord(keyEvent({ key: "b", metaKey: true }))).toBe(
      false,
    );
  });
});
