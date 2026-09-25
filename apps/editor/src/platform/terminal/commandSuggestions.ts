/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferLine, IBufferNamespace } from "@xterm/xterm";

// A terminal has no prompt model in Axon yet, so the current command is derived
// from the buffer the shell has already echoed. The buffer is the only source
// that reflects the shell's own line editing, including readline-style history
// recall, so reading it beats tracking keystrokes in the renderer.
const MAX_WALKED_ROWS = 200;

export interface TerminalInputSnapshot {
  // The full logical command up to the cursor, including rows that wrapped.
  line: string;
  // Cells between the start of the cursor's visual row and the cursor. Ghost text
  // is anchored to the cursor, so this is the offset that matters for layout.
  cellsBeforeCursor: number;
  // True when nothing is printed after the cursor on its row, which is what makes
  // Right-arrow a safe accept key instead of a cursor movement.
  cursorIsAtLineEnd: boolean;
  // True when the cursor sits on the buffer's last row. Output from a finished
  // command is always followed by a fresh row, so this separates a real prompt
  // from the tail of command output.
  isLastRow: boolean;
  // Rows above the cursor inside the viewport, used to place the overlay.
  rowsAboveCursor: number;
  // False when a full-screen program owns the alternate buffer, where the
  // visible rows are a program's own UI rather than a shell command line.
  isShellBuffer: boolean;
}

function countCellsBefore(line: IBufferLine | undefined, cursorX: number) {
  let cells = 0;
  if (!line) return cells;

  for (let column = 0; column < cursorX; column += 1) {
    // A wide glyph reports width 2 and the cell after it reports 0, so summing
    // every non-zero width keeps CJK and emoji lines aligned with the grid.
    const width = line.getCell(column)?.getWidth() ?? 0;
    if (width > 0) cells += width;
  }
  return cells;
}

function hasCellsAfterCursor(
  line: IBufferLine | undefined,
  cursorX: number,
  cols: number,
) {
  if (!line) return true;

  // A row keeps its old allocation after a resize, so the scan stops at the grid
  // width instead of the row length to avoid reading stale columns.
  for (let column = cursorX; column < Math.min(line.length, cols); column += 1) {
    if ((line.getCell(column)?.getWidth() ?? 0) > 0) return true;
  }
  return false;
}

// cols comes from the terminal rather than the buffer because a row keeps the cell
// count it had before a resize, so the grid width is the only honest end of line.
export function readTerminalInputSnapshot(
  buffer: IBufferNamespace,
  cols: number,
): TerminalInputSnapshot {
  const active = buffer.active;
  const cursorRow = active.getLine(active.cursorY);
  const cellsBeforeCursor = countCellsBefore(cursorRow, active.cursorX);
  const cursorIsAtLineEnd = !hasCellsAfterCursor(
    cursorRow,
    active.cursorX,
    cols,
  );

  // A wrapped line continues onto the cursor's row, so the command the user is
  // actually typing starts on an earlier row. Walking back to the first
  // non-wrapped row is what makes a long `git commit` still match its history
  // entry instead of matching only the tail that happens to fit on screen.
  const rows: string[] = [];
  for (let offset = 0; offset < MAX_WALKED_ROWS; offset += 1) {
    const row = active.cursorY - offset;
    if (row < 0) break;
    const bufferLine = active.getLine(row);
    if (!bufferLine) break;
    if (row === active.cursorY) {
      rows.unshift(bufferLine.translateToString(true, 0, active.cursorX));
    } else {
      rows.unshift(bufferLine.translateToString(true));
    }
    if (!bufferLine.isWrapped) break;
  }

  return {
    // Trailing blanks before the cursor are real input, a prompt such as "% "
    // ends with one, so nothing is trimmed here. Only the walked rows drop their
    // unused cells.
    line: rows.join(""),
    cellsBeforeCursor,
    cursorIsAtLineEnd,
    isLastRow: active.cursorY >= active.length - 1,
    rowsAboveCursor: active.cursorY - active.viewportY,
    isShellBuffer: active.type === "normal",
  };
}

// A leading space is the shell convention for "do not record this", matching the
// HISTCONTROL=ignorespace handling Axon already relies on for its own workspace
// cd. Suggesting a command the shell deliberately refused to remember would
// reintroduce exactly the history noise that convention exists to prevent.
export function findCommandSuggestion(line: string, commands: string[]) {
  if (!line) return null;
  if (line !== line.trimStart()) return null;
  if (line.includes("\n") || line.includes("\r")) return null;

  // commands is ordered newest first, so the first hit is the command the user
  // ran most recently. Walking the list instead of building a prefix index keeps
  // the per-keystroke cost proportional to the corpus but the common case (a
  // short unique prefix) resolves on the first few entries.
  for (const command of commands) {
    if (command.length <= line.length) continue;
    if (!command.startsWith(line)) continue;
    return command.slice(line.length);
  }
  return null;
}

export function clipSuggestionToWidth(text: string, columns: number) {
  if (columns <= 0) return "";
  // Counting code points instead of UTF-16 units keeps an emoji or a combining
  // character from being cut in half by the width clip.
  return [...text].slice(0, columns).join("");
}
