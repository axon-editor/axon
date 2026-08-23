import { beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import {
  getOutputByteLength,
  type TerminalSession,
} from "./terminalProtocol";
import {
  hasPendingTerminalOutput,
  writeTerminalOutput,
} from "./terminalSessionIo";

function createSession() {
  const sent: string[] = [];
  const written: Array<string | Uint8Array> = [];
  const term = {
    buffer: { active: { type: "normal", viewportY: 0, baseY: 0 } },
    rows: 24,
    write(data: string | Uint8Array, callback: () => void) {
      written.push(data);
      callback();
    },
  };
  const session = {
    term,
    ws: {
      readyState: WebSocket.OPEN,
      send: (value: string) => sent.push(value),
    },
    pendingXtermWriteBytes: 0,
    receivedBytes: 0,
    lastAckedBytes: 0,
    ackTimer: null,
    disposed: false,
  } as unknown as TerminalSession;

  return { session, sent, written };
}

describe("terminal output accounting", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("counts UTF-8 bytes instead of JavaScript code units", () => {
    expect(getOutputByteLength("A🙂é")).toBe(7);
  });

  it("acknowledges output only after xterm commits the write", () => {
    const { session, sent, written } = createSession();

    writeTerminalOutput(session, "final-output");

    expect(written).toEqual(["final-output"]);
    expect(session.receivedBytes).toBe(12);
    expect(session.lastAckedBytes).toBe(12);
    expect(hasPendingTerminalOutput(session)).toBe(false);
    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({
      type: "ack",
      offset: 12,
    });
  });

  it("passes websocket frames directly to xterm without re-batching them", () => {
    const { session, written } = createSession();
    const callbacks: Array<() => void> = [];
    session.term!.write = vi.fn((data, callback) => {
      written.push(data);
      callbacks.push(callback);
    });
    const binaryFrame = new Uint8Array([0x1b, 0x5b, 0x32, 0x53]);

    writeTerminalOutput(session, binaryFrame.buffer);
    writeTerminalOutput(session, "next frame");

    expect(written).toEqual([binaryFrame, "next frame"]);
    expect(session.pendingXtermWriteBytes).toBe(14);
    callbacks.splice(0).forEach((callback) => callback());
    expect(session.pendingXtermWriteBytes).toBe(0);
  });

  it("acknowledges the cumulative stream only after all direct writes parse", () => {
    const { session, sent } = createSession();
    const callbacks: Array<() => void> = [];
    session.term!.write = vi.fn((_data, callback) => callbacks.push(callback));

    writeTerminalOutput(session, "first batch");
    writeTerminalOutput(session, "second batch");

    expect(callbacks).toHaveLength(2);
    callbacks[0]();
    expect(session.receivedBytes).toBe(11);
    expect(session.pendingXtermWriteBytes).toBe(12);
    expect(sent).toHaveLength(0);

    callbacks[1]();
    expect(session.receivedBytes).toBe(23);
    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({
      type: "ack",
      offset: 23,
    });
  });

  it("preserves numbered output in a real xterm buffer while reading scrollback", async () => {
    const terminal = new Terminal({ cols: 120, rows: 24, scrollback: 25_000 });
    const { session } = createSession();
    session.term = terminal;

    const createLines = (start: number, count: number) =>
      Array.from(
        { length: count },
        (_value, index) =>
          `AXON_BUFFER_${String(start + index).padStart(5, "0")}\r\n`,
      ).join("");

    writeTerminalOutput(session, createLines(0, 8_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    terminal.scrollToBottom();
    terminal.scrollLines(-200);
    const readingViewport = terminal.buffer.active.viewportY;

    writeTerminalOutput(session, createLines(8_000, 6_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    expect(terminal.buffer.active.viewportY).toBe(readingViewport);

    terminal.scrollToBottom();
    writeTerminalOutput(session, createLines(14_000, 6_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    expect(terminal.buffer.active.viewportY).toBeGreaterThanOrEqual(
      terminal.buffer.active.baseY - 1,
    );

    const renderedLines = new Set<string>();
    for (let index = 0; index < terminal.buffer.active.length; index += 1) {
      const line = terminal.buffer.active
        .getLine(index)
        ?.translateToString(true);
      if (line) renderedLines.add(line);
    }
    for (let index = 0; index < 20_000; index += 1) {
      expect(
        renderedLines.has(`AXON_BUFFER_${String(index).padStart(5, "0")}`),
      ).toBe(true);
    }

    terminal.dispose();
  });

  it("preserves ANSI agent output while the reader remains in scrollback", async () => {
    const terminal = new Terminal({ cols: 100, rows: 20, scrollback: 10_000 });
    const { session } = createSession();
    session.term = terminal;

    const createAnsiLines = (start: number, count: number) =>
      Array.from({ length: count }, (_value, index) => {
        const line = String(start + index).padStart(5, "0");
        return `\x1b[?2026h\x1b[36mAXON_AGENT_${line}\x1b[0m\r\n\x1b[?2026l`;
      }).join("");

    writeTerminalOutput(session, createAnsiLines(0, 2_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    terminal.scrollToBottom();
    terminal.scrollLines(-120);
    const readingViewport = terminal.buffer.active.viewportY;

    writeTerminalOutput(session, createAnsiLines(2_000, 2_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );

    expect(terminal.buffer.active.viewportY).toBe(readingViewport);
    const rendered = Array.from(
      { length: terminal.buffer.active.length },
      (_value, index) =>
        terminal.buffer.active.getLine(index)?.translateToString(true) ?? "",
    ).join("\n");
    expect(rendered).toContain("AXON_AGENT_00000");
    expect(rendered).toContain("AXON_AGENT_03999");

    terminal.dispose();
  });

  it("preserves just-scrolled-out lines while actively following the tail", async () => {
    const terminal = new Terminal({ cols: 100, rows: 20, scrollback: 10_000 });
    const { session } = createSession();
    session.term = terminal;

    const createBurst = (start: number, count: number) =>
      Array.from({ length: count }, (_value, index) => {
        const line = String(start + index).padStart(5, "0");
        return `\x1b[?2026h\x1b[32mAXON_LIVE_${line}\x1b[0m\r\n\x1b[?2026l`;
      }).join("");

    for (let burst = 0; burst < 40; burst += 1) {
      writeTerminalOutput(session, createBurst(burst * 25, 25));
      terminal.scrollToBottom();
    }

    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    terminal.scrollToBottom();

    const bufferedOutput = Array.from(
      { length: terminal.buffer.active.length },
      (_value, index) =>
        terminal.buffer.active.getLine(index)?.translateToString(true) ?? "",
    ).join("\n");
    expect(bufferedOutput).toContain("AXON_LIVE_00000");
    expect(bufferedOutput).toContain("AXON_LIVE_00960");
    expect(bufferedOutput).toContain("AXON_LIVE_00999");

    terminal.dispose();
  });

  it("preserves rows displaced by a scroll-region command through the direct path", async () => {
    const terminal = new Terminal({ cols: 20, rows: 10, scrollback: 100 });
    const { session } = createSession();
    session.term = terminal;

    writeTerminalOutput(
      session,
      [
        "0\r\n",
        "1\r\n",
        "2\r\n",
        "3\r\n",
        "4\r\n",
        "5\r\n",
        "6\r\n",
        "7\r\n",
        "8\r\n",
        "9",
        "\x1b[1;4r",
        "\x1b[2S",
        "replacement",
      ].join(""),
    );
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );

    expect(terminal.buffer.active.baseY).toBe(2);
    expect(
      Array.from({ length: 4 }, (_value, index) =>
        terminal.buffer.active.getLine(index)?.translateToString(true),
      ),
    ).toEqual(["0", "1", "replacement", "3"]);

    terminal.dispose();
  });
});
