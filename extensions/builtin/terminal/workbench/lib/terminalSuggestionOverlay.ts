/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as XTerm } from "@xterm/xterm";
import {
  clipSuggestionToWidth,
  findCommandSuggestion,
  readTerminalInputSnapshot,
  type TerminalInputSnapshot,
} from "@axon-editor/platform/terminal/commandSuggestions";
import type {
  TerminalSuggestionAcceptKey,
  TerminalSuggestionController,
} from "@axon-editor/platform/terminal/terminalProtocol";
import {
  getCommandHistory,
  loadCommandHistory,
  recordTypedCommand,
} from "./commandHistoryStore";

const SCREEN_SELECTOR = ".xterm-screen";
const OVERLAY_CLASS_NAME = "axon-terminal-suggestion";

interface SuggestionRenderState {
  suggestion: string;
  snapshot: TerminalInputSnapshot;
}

// xterm has no suggestion API the way a code editor has one, so the ghost text is
// a DOM element positioned over the cursor inside the screen element. Anchoring
// to `.xterm-screen` instead of the terminal container is deliberate: that element
// is sized to the cell grid and is the origin both the DOM rows and the WebGL
// canvas draw from, so one transform works for either renderer.
export function createTerminalSuggestionController({
  fontFamily,
  fontSize,
  fontWeight,
  onAccept,
  term,
}: {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  onAccept: (text: string) => void;
  term: XTerm;
}): TerminalSuggestionController {
  let overlay: HTMLDivElement | null = null;
  let visible = true;
  // The prompt is what separates the shell's own text from the user's input on a
  // row. Without shell integration the only reliable moment to learn it is right
  // after Enter, when the shell has written a fresh prompt and the cursor is at
  // the end of it. Guessing instead would make every suggestion search for a
  // command starting with the prompt string.
  let promptText: string | null = null;
  let awaitingPrompt = true;
  // Escape hides the ghost until the input line changes, the same way fish
  // behaves. Keying it on the line means any further typing brings suggestions
  // back without the user having to remember a toggle.
  let dismissedInput: string | null = null;
  let frame: number | null = null;
  let disposed = false;

  function getScreenElement() {
    return term.element?.querySelector<HTMLElement>(SCREEN_SELECTOR) ?? null;
  }

  function readInput(snapshot: TerminalInputSnapshot) {
    if (awaitingPrompt) {
      // A command that printed without a trailing newline can leave the cursor at
      // the end of a row that also holds its output, and the real prompt then
      // extends that same row. Requiring the last row, an empty trailing line, or
      // a cursor parked past the row's text keeps ordinary output from being
      // learned as a prompt. The cost is one command with an unterminated output
      // line before the next prompt is learned correctly.
      const isFreshPromptRow =
        snapshot.isLastRow &&
        (snapshot.cursorIsAtLineEnd || !snapshot.line.trim());
      if (!isFreshPromptRow) return "";
      // An empty row means the prompt has not been written yet, or the user runs
      // an empty PS1. Either way there is nothing to learn and nothing to suggest.
      if (!snapshot.line.trim()) return "";
      promptText = snapshot.line;
      awaitingPrompt = false;
      return "";
    }
    if (promptText && snapshot.line.startsWith(promptText)) {
      return snapshot.line.slice(promptText.length);
    }
    // The prompt changed without an Enter, for example a shell hook that redraws
    // it. Matching the whole row keeps a suggestion working rather than leaving
    // the row permanently unsuggestable.
    return snapshot.line;
  }

  function hide() {
    overlay?.remove();
  }

  function render(state: SuggestionRenderState) {
    const screen = getScreenElement();
    if (!screen || !visible) {
      hide();
      return;
    }

    const cellWidth = screen.clientWidth / term.cols;
    const cellHeight = screen.clientHeight / term.rows;
    const row = state.snapshot.rowsAboveCursor;
    if (!(cellWidth > 0) || !(cellHeight > 0) || row < 0 || row >= term.rows) {
      hide();
      return;
    }

    const available = term.cols - term.buffer.active.cursorX;
    const text = clipSuggestionToWidth(state.suggestion, available);
    if (!text) {
      hide();
      return;
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = OVERLAY_CLASS_NAME;
      overlay.setAttribute("aria-hidden", "true");
    }
    // xterm empties the screen element when the renderer is swapped, which the
    // GPU acceleration setting can do at runtime. Re-attaching on demand keeps the
    // ghost working after a renderer change without rebuilding the terminal.
    if (!overlay.isConnected) screen.appendChild(overlay);

    overlay.style.fontFamily = fontFamily;
    overlay.style.fontSize = `${fontSize}px`;
    overlay.style.fontWeight = `${fontWeight}`;
    overlay.style.height = `${cellHeight}px`;
    overlay.style.lineHeight = `${cellHeight}px`;
    overlay.style.transform = `translate(${state.snapshot.cellsBeforeCursor * cellWidth}px, ${row * cellHeight}px)`;
    overlay.textContent = text;
  }

  function evaluate() {
    if (disposed) return;

    const snapshot = readTerminalInputSnapshot(term.buffer, term.cols);
    if (!snapshot.isShellBuffer) {
      // A full-screen program owns the alternate buffer, so the row under the
      // cursor is that program's UI and has nothing to do with a shell command.
      hide();
      return;
    }

    const input = readInput(snapshot);
    const suggestion =
      input && input !== dismissedInput
        ? findCommandSuggestion(input, getCommandHistory())
        : null;

    if (!suggestion) {
      hide();
      return;
    }

    render({ snapshot, suggestion });
  }

  // Output can arrive in bursts while an agent streams, and the history scan is
  // far more expensive than reading the cursor row, so refreshes are coalesced
  // into a single animation frame instead of running per parsed write.
  function scheduleEvaluate() {
    if (disposed || frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      evaluate();
    });
  }

  void loadCommandHistory().then(scheduleEvaluate);

  const cursorMoveDisposable = term.onCursorMove(scheduleEvaluate);
  const writeParsedDisposable = term.onWriteParsed(scheduleEvaluate);
  const resizeDisposable = term.onResize(scheduleEvaluate);
  const keyDisposable = term.onKey(({ key }) => {
    if (key === "Enter") {
      const snapshot = readTerminalInputSnapshot(term.buffer, term.cols);
      if (snapshot.isShellBuffer) {
        recordTypedCommand(readInput(snapshot));
      }
      // The command line just ended, so the next row the shell writes is a prompt.
      awaitingPrompt = true;
      dismissedInput = null;
      hide();
      scheduleEvaluate();
      return;
    }
    if (key === "Escape") {
      const snapshot = readTerminalInputSnapshot(term.buffer, term.cols);
      // Dismiss on the same stripped input the matcher uses, otherwise the ghost
      // would come straight back on the next refresh.
      dismissedInput = snapshot.isShellBuffer ? readInput(snapshot) : null;
      hide();
    }
  });

  return {
    accept(key: TerminalSuggestionAcceptKey) {
      if (disposed) return false;

      const snapshot = readTerminalInputSnapshot(term.buffer, term.cols);
      if (!snapshot.isShellBuffer) return false;
      // Right-arrow is only an accept key at the end of the line. Anywhere else it
      // is the user's cursor movement, and taking it over would break editing in
      // the middle of a recalled command.
      if (key === "ArrowRight" && !snapshot.cursorIsAtLineEnd) return false;
      const input = readInput(snapshot);
      if (!input || input === dismissedInput) return false;

      const suggestion = findCommandSuggestion(input, getCommandHistory());
      if (!suggestion) return false;

      // Dismiss against the completed line so the shell's echo of the inserted
      // text cannot immediately re-render the same ghost underneath the cursor.
      dismissedInput = input + suggestion;
      hide();
      onAccept(suggestion);
      return true;
    },
    dispose() {
      disposed = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      cursorMoveDisposable.dispose();
      writeParsedDisposable.dispose();
      resizeDisposable.dispose();
      keyDisposable.dispose();
      hide();
    },
    hasSuggestion() {
      return Boolean(overlay?.isConnected);
    },
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      if (!nextVisible) {
        hide();
        return;
      }
      scheduleEvaluate();
    },
  };
}
