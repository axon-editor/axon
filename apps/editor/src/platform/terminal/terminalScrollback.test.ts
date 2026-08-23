import { Terminal } from "@xterm/xterm";
import path from "node:path";
import { loadConfigFromFile } from "vite";
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
  it("serves the corrected xterm runtime without a stale optimized copy", async () => {
    const configPath = path.resolve(process.cwd(), "vite.config.ts");
    const loadedConfig = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      configPath,
    );

    expect(loadedConfig?.config.optimizeDeps?.exclude).toContain(
      "@xterm/xterm",
    );
  });

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

  it("retains a full viewport-sized CSI S displacement", async () => {
    const terminal = new Terminal({ cols: 32, rows: 22, scrollback: 100 });

    try {
      const originalRows = Array.from(
        { length: 22 },
        (_value, index) => `captured-row-${String(index + 1).padStart(2, "0")}`,
      );
      await writeTerminal(terminal, originalRows.join("\r\n"));

      // The captured failing agent stream used CSI 12 S while its composer was
      // protected below row 12. Every displaced row must enter scrollback; the
      // stock xterm handler splice-deletes exactly these twelve rows instead.
      await writeTerminal(terminal, "\x1b[1;12r\x1b[12S\x1b[r");

      expect(terminal.buffer.active.baseY).toBe(12);
      expect(readBufferLines(terminal).slice(0, 12)).toEqual(
        originalRows.slice(0, 12),
      );
    } finally {
      terminal.dispose();
    }
  });
});
