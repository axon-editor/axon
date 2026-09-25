/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TerminalSuggestionAcceptKey } from "@axon-editor/platform/terminal/terminalProtocol";

type TerminalKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export function shouldClearTerminal(event: TerminalKeyEvent) {
  return (
    event.key.toLowerCase() === "k" &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

// Tab and Right-arrow accept an inline suggestion, but only when one is visible.
// Every other chord, including a modified Tab, stays with the shell so its own
// completion and reverse completion keep working on the same keys. Right-arrow is
// only offered at the end of the line, which the suggestion controller checks
// against the cursor position before it accepts.
export function getCommandSuggestionAcceptKey(
  event: TerminalKeyEvent,
): TerminalSuggestionAcceptKey | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (event.key === "Tab") return "Tab";
  if (event.key === "ArrowRight") return "ArrowRight";
  return null;
}
