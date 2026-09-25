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
  cursorX?: number;
  type?: "normal" | "alternate";
  viewportY?: number;
  wrappedRows?: number[];
}

function createBuffer(rows: string[], options: FakeBufferOptions = {}) {
  const wrapped = new Set(options.wrappedRows ?? []);

  return {
    active: {
      type: options.type ?? "normal",
      cursorX: options.cursorX ?? 0,
      cursorY: rows.length - 1,
      viewportY: options.viewportY ?? 0,
      getLine: (y: number) => {
        const row = rows[y];
        if (row === undefined) return undefined;
        const cellCount = [...row].length;
        return {
          isWrapped: wrapped.has(y),
          length: cellCount,
          getCell: (x: number): IBufferCell | undefined => {
            if (x >= cellCount) return undefined;
            return { getWidth: () => 1 } as IBufferCell;
          },
          translateToString: (
            trimRight = false,
            startColumn = 0,
            endColumn = row.length,
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

    expect(readTerminalInputSnapshot(buffer, 80).line).toBe("~/code git stat");
  });

  it("reassembles a command that wrapped onto the cursor row", () => {
    const buffer = createBuffer(["git commit -m 'a fairly", "long message'"], {
      cursorX: 14,
      wrappedRows: [1],
    });

    expect(readTerminalInputSnapshot(buffer, 80).line).toBe(
      "git commit -m 'a fairlylong message'",
    );
  });

  it("counts the cells between the row start and the cursor", () => {
    const buffer = createBuffer(["ab cd"], { cursorX: 3 });

    const snapshot = readTerminalInputSnapshot(buffer, 80);
    expect(snapshot.cellsBeforeCursor).toBe(3);
    expect(snapshot.cursorIsAtLineEnd).toBe(false);
  });

  it("reports how many rows sit between the viewport and the cursor", () => {
    const buffer = createBuffer(["one", "two"], {
      cursorX: 1,
      viewportY: 0,
    });

    expect(readTerminalInputSnapshot(buffer, 80).rowsAboveCursor).toBe(1);
  });

  it("treats a cursor past the row text as the end of the line", () => {
    const buffer = createBuffer(["git status"], { cursorX: 10 });

    expect(readTerminalInputSnapshot(buffer, 80).cursorIsAtLineEnd).toBe(true);
  });

  it("marks the alternate buffer as a program rather than a shell", () => {
    const buffer = createBuffer(["vim README.md"], { type: "alternate" });

    expect(readTerminalInputSnapshot(buffer, 80).isShellBuffer).toBe(false);
  });
});
