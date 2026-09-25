/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  getCommandSuggestionAcceptKey,
  shouldClearTerminal,
} from "../../../../../extensions/builtin/terminal/workbench/lib/terminalShortcuts";

function keyEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("terminal shortcuts", () => {
  it("reserves unmodified Command+K for clearing the Axon terminal", () => {
    expect(shouldClearTerminal(keyEvent({ metaKey: true }))).toBe(true);
    expect(shouldClearTerminal(keyEvent({ key: "K", metaKey: true }))).toBe(
      true,
    );
  });

  it("leaves Ctrl+K and modified Command+K available to terminal programs", () => {
    expect(shouldClearTerminal(keyEvent({ ctrlKey: true }))).toBe(false);
    expect(
      shouldClearTerminal(keyEvent({ ctrlKey: true, metaKey: true })),
    ).toBe(false);
    expect(
      shouldClearTerminal(keyEvent({ metaKey: true, shiftKey: true })),
    ).toBe(false);
    expect(shouldClearTerminal(keyEvent({ altKey: true, metaKey: true }))).toBe(
      false,
    );
  });
});

describe("command suggestion keys", () => {
  it("accepts a suggestion with an unmodified Tab or Right-arrow", () => {
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "Tab" }))).toBe("Tab");
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "ArrowRight" }))).toBe(
      "ArrowRight",
    );
  });

  it("leaves modified completion keys to the shell", () => {
    expect(
      getCommandSuggestionAcceptKey(keyEvent({ key: "Tab", shiftKey: true })),
    ).toBeNull();
    expect(
      getCommandSuggestionAcceptKey(keyEvent({ key: "Tab", ctrlKey: true })),
    ).toBeNull();
    expect(
      getCommandSuggestionAcceptKey(keyEvent({ key: "Tab", altKey: true })),
    ).toBeNull();
  });

  it("does not claim keys the shell owns for its own line editing", () => {
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "k" }))).toBeNull();
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "r" }))).toBeNull();
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "ArrowLeft" }))).toBeNull();
    expect(getCommandSuggestionAcceptKey(keyEvent({ key: "Enter" }))).toBeNull();
  });
});
