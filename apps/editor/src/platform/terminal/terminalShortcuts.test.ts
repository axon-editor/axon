import { describe, expect, it } from "vitest";
import { shouldClearTerminal } from "../../../../../extensions/builtin/terminal/workbench/lib/terminalShortcuts";

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
