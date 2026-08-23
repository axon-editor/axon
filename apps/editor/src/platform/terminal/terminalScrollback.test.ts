import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

function writeTerminal(terminal: Terminal, data: string) {
  return new Promise<void>((resolve) => terminal.write(data, resolve));
}

function readBufferLines(terminal: Terminal) {
  return Array.from(
    { length: terminal.buffer.active.length },
    (_value, index) =>
      terminal.buffer.active.getLine(index)?.translateToString(true) ?? "",
  );
}

describe("terminal application scrollback", () => {
  it("retains rows scrolled out by a top-anchored CSI S region", async () => {
    const terminal = new Terminal({ cols: 20, rows: 10, scrollback: 100 });

    try {
      // Interactive terminal programs can keep controls fixed with a scroll
      // region and move completed output upward using CSI S. The first two rows
      // must enter scrollback here; deleting them reproduces the visible blank
      // bands where output from any program disappears after crossing the top
      // of the viewport.
      await writeTerminal(
        terminal,
        "0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9" +
          "\x1b[1;4r\x1b[2S" +
          "replacement",
      );

      expect(terminal.buffer.active.baseY).toBe(2);
      expect(readBufferLines(terminal).slice(0, 4)).toEqual([
        "0",
        "1",
        "replacement",
        "3",
      ]);
    } finally {
      terminal.dispose();
    }
  });
});
