/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferCell, IBufferNamespace } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import {
  clipSuggestionToWidth,
  findCommandSuggestion,
  readTerminalInputSnapshot,
} from "./commandSuggestions";

interface FakeBufferOptions {
  baseY?: number;
  cols?: number;
  cursorX?: number;
  cursorY?: number;
  type?: "normal" | "alternate";
  viewportY?: number;
  wrappedRows?: number[];
}

// The row list doubles as the buffer's `length`, which xterm always keeps at least
// as long as the viewport, so a fake buffer has to allocate the blank tail a real
// terminal starts with.
function createBuffer(rows: string[], options: FakeBufferOptions = {}) {
  const wrapped = new Set(options.wrappedRows ?? []);
  const cols = options.cols ?? 80;

  return {
    active: {
      type: options.type ?? "normal",
      baseY: options.baseY ?? 0,
      length: rows.length,
      cursorX: options.cursorX ?? 0,
      cursorY: options.cursorY ?? rows.length - 1,
      viewportY: options.viewportY ?? 0,
      getLine: (y: number) => {
        const row = rows[y];
        if (row === undefined) return undefined;
        return {
          isWrapped: wrapped.has(y),
          // A real row is allocated to the full grid width, and an unused cell still
          // reports a width of 1, so scanning cells cannot tell a blank row from a
          // full one. Only the row's text says what was actually written.
          length: cols,
          getCell: (): IBufferCell => ({ getWidth: () => 1 }) as IBufferCell,
          translateToString: (
            trimRight = false,
            startColumn = 0,
            endColumn = cols,
          ) => {
            const text = row.slice(startColumn, endColumn);
            return trimRight ? text.replace(/\s+$/, "") : text;
          },
        };
      },
    },
  } as unknown as IBufferNamespace;
}

describe("findCommandSuggestion", () => {
  const commands = [
    "git commit -m 'fix terminal ghost text'",
    "git status",
    "git push origin main",
  ];

  it("completes the most recent matching command", () => {
    expect(findCommandSuggestion("git c", commands)).toBe(
      "ommit -m 'fix terminal ghost text'",
    );
  });

  it("returns nothing when the line is already the whole command", () => {
    expect(findCommandSuggestion("git status", commands)).toBeNull();
  });

  it("returns nothing when no entry starts with the line", () => {
    expect(findCommandSuggestion("ls", commands)).toBeNull();
  });

  it("ignores lines the shell was told not to remember", () => {
    expect(findCommandSuggestion(" git status", commands)).toBeNull();
  });

  it("ignores a command that spans more than one line", () => {
    expect(findCommandSuggestion("git commit \\\n  -m fix", commands)).toBeNull();
  });

  it("ignores an empty line", () => {
    expect(findCommandSuggestion("", commands)).toBeNull();
  });
});

describe("clipSuggestionToWidth", () => {
  it("keeps whole code points when the row runs out of columns", () => {
    expect(clipSuggestionToWidth("origin main 🚀", 12)).toBe("origin main ");
  });

  it("returns nothing when no column is left", () => {
    expect(clipSuggestionToWidth("origin main", 0)).toBe("");
  });
});

describe("readTerminalInputSnapshot", () => {
  it("reads the command up to the cursor", () => {
    const buffer = createBuffer(["~/code git stat"], { cursorX: 15 });

    expect(readTerminalInputSnapshot(buffer, 80, 24).line).toBe("~/code git stat");
  });

  it("reassembles a command that wrapped onto the cursor row", () => {
    const buffer = createBuffer(["git commit -m 'a fairly", "long message'"], {
      cursorX: 14,
      wrappedRows: [1],
    });

    expect(readTerminalInputSnapshot(buffer, 80, 24).line).toBe(
      "git commit -m 'a fairlylong message'",
    );
  });

  it("counts the cells between the row start and the cursor", () => {
    const buffer = createBuffer(["ab cd"], { cursorX: 3 });

    const snapshot = readTerminalInputSnapshot(buffer, 80, 24);
    expect(snapshot.cellsBeforeCursor).toBe(3);
    expect(snapshot.cursorIsAtLineEnd).toBe(false);
  });

  it("reports how many rows sit between the viewport and the cursor", () => {
    const buffer = createBuffer(["one", "two"], {
      cursorX: 1,
      viewportY: 0,
    });

    expect(readTerminalInputSnapshot(buffer, 80, 24).rowsAboveCursor).toBe(1);
  });

  it("treats a cursor past the row text as the end of the line", () => {
    const buffer = createBuffer(["git status"], { cursorX: 10 });

    expect(readTerminalInputSnapshot(buffer, 80, 24).cursorIsAtLineEnd).toBe(true);
  });

  it("does not read the unused cells of an allocated row as text", () => {
    // The row is allocated to all 80 columns but only the prompt is written, so a
    // cell scan would see content all the way to the right edge and refuse every
    // prompt as a prompt.
    const buffer = createBuffer(["~/code % "], { cursorX: 9 });

    const snapshot = readTerminalInputSnapshot(buffer, 80, 24);
    expect(snapshot.cursorIsAtLineEnd).toBe(true);
    expect(snapshot.isLastRow).toBe(true);
  });

  it("sees text that really was written after the cursor", () => {
    const buffer = createBuffer(["~/code % git status"], { cursorX: 9 });

    expect(
      readTerminalInputSnapshot(buffer, 80, 24).cursorIsAtLineEnd,
    ).toBe(false);
  });

  it("reports a fresh prompt on the first row as the last used row", () => {
    const rows = ["~/code % ", ...Array.from({ length: 23 }, () => "")];
    const buffer = createBuffer(rows, { cursorX: 9 });

    expect(readTerminalInputSnapshot(buffer, 80, 24).isLastRow).toBe(true);
  });

  it("does not report a row with output under it as the last used row", () => {
    const buffer = createBuffer(["~/code % ", "total 12"], {
      cursorX: 9,
      cursorY: 0,
    });

    expect(readTerminalInputSnapshot(buffer, 80, 2).isLastRow).toBe(false);
  });

  it("does not report a row as last while the viewport is scrolled up", () => {
    const rows = ["~/code % ", "total 12", "", ""];
    const buffer = createBuffer(rows, { baseY: 1, cursorX: 9, cursorY: 0 });

    expect(readTerminalInputSnapshot(buffer, 80, 2).isLastRow).toBe(false);
  });

  it("marks the alternate buffer as a program rather than a shell", () => {
    const buffer = createBuffer(["vim README.md"], { type: "alternate" });

    expect(readTerminalInputSnapshot(buffer, 80, 24).isShellBuffer).toBe(false);
  });
});
