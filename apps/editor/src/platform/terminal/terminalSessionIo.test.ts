import { beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import {
  getOutputByteLength,
  TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES,
  TERMINAL_WRITE_BATCH_BYTES,
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
    refresh: vi.fn(),
    scrollToBottom: vi.fn(),
  };
  const session = {
    term,
    ws: {
      readyState: WebSocket.OPEN,
      send: (value: string) => sent.push(value),
    },
    outputQueue: [],
    outputWriting: false,
    outputDrainTimer: null,
    outputRefreshFrame: null,
    inFlightWriteBytes: 0,
    pendingBinaryDecodes: 0,
    queuedBytes: 0,
    maxQueuedBytes: 0,
    drainedChunks: 0,
    receivedBytes: 0,
    lastAckedBytes: 0,
    ackTimer: null,
    atBottom: true,
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

  it("measures websocket-to-xterm commit latency without reading output", () => {
    const { session } = createSession();
    const callbacks: Array<() => void> = [];
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    session.term!.write = vi.fn((_data, callback) => callbacks.push(callback));

    writeTerminalOutput(session, "measured output");
    now = 137;
    callbacks[0]();

    expect(session.lastWriteCommitLatencyMs).toBe(37);
    expect(session.maxWriteCommitLatencyMs).toBe(37);
  });

  it("coalesces committed output into one viewport repaint", () => {
    const { session } = createSession();
    const callbacks: Array<() => void> = [];
    const frames: FrameRequestCallback[] = [];
    const term = session.term!;
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    vi.mocked(term.scrollToBottom).mockClear();
    term.write = vi.fn((_data, callback) => callbacks.push(callback));

    writeTerminalOutput(session, "first batch");
    writeTerminalOutput(session, "second batch");

    expect(callbacks).toHaveLength(2);
    callbacks[0]();
    callbacks[1]();

    expect(frames).toHaveLength(1);
    expect(term.scrollToBottom).not.toHaveBeenCalled();
    expect(term.refresh).not.toHaveBeenCalled();
    frames[0](16);
    expect(term.refresh).toHaveBeenCalledOnce();
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
    animationFrame.mockRestore();
  });

  it("does not pull a detached reader back to the live tail", () => {
    const { session } = createSession();
    const frames: FrameRequestCallback[] = [];
    const term = session.term!;
    session.atBottom = false;
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    vi.mocked(term.scrollToBottom).mockClear();

    writeTerminalOutput(session, "new output while reading scrollback");

    expect(frames).toHaveLength(1);
    frames[0](16);
    expect(term.scrollToBottom).not.toHaveBeenCalled();
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
    animationFrame.mockRestore();
  });

  it("splits oversized websocket frames before writing to xterm", () => {
    const { session, written } = createSession();
    const callbacks: Array<() => void> = [];
    session.term!.write = vi.fn((data, callback) => {
      written.push(data);
      callbacks.push(callback);
    });
    const payload = new Uint8Array(TERMINAL_WRITE_BATCH_BYTES * 3 + 17);
    payload.forEach((_value, index) => {
      payload[index] = index % 251;
    });

    writeTerminalOutput(session, payload.buffer);

    expect(written).toHaveLength(4);
    expect(
      written.every(
        (chunk) => getOutputByteLength(chunk) <= TERMINAL_WRITE_BATCH_BYTES,
      ),
    ).toBe(true);
    callbacks.splice(0).forEach((callback) => callback());
    expect(session.receivedBytes).toBe(payload.byteLength);
    expect(hasPendingTerminalOutput(session)).toBe(false);
  });

  it("bounds bytes queued inside xterm until write callbacks commit", () => {
    const { session, written } = createSession();
    const callbacks: Array<() => void> = [];
    session.term!.write = vi.fn((data, callback) => {
      written.push(data);
      callbacks.push(callback);
    });
    const payload = new Uint8Array(TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES * 2 + 31);

    writeTerminalOutput(session, payload.buffer);

    expect(
      written.reduce((total, chunk) => total + getOutputByteLength(chunk), 0),
    ).toBe(TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES);
    expect(session.inFlightWriteBytes).toBe(TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES);

    while (callbacks.length > 0) {
      callbacks.shift()!();
    }

    expect(session.receivedBytes).toBe(payload.byteLength);
    expect(session.inFlightWriteBytes).toBe(0);
    expect(hasPendingTerminalOutput(session)).toBe(false);
  });

  it("preserves numbered output in a real xterm buffer while reading scrollback", async () => {
    const terminal = new Terminal({ cols: 120, rows: 24, scrollback: 25_000 });
    const { session } = createSession();
    session.term = terminal;
    session.atBottom = true;

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
    session.atBottom = false;
    const readingViewport = terminal.buffer.active.viewportY;

    writeTerminalOutput(session, createLines(8_000, 6_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    expect(terminal.buffer.active.viewportY).toBe(readingViewport);

    terminal.scrollToBottom();
    session.atBottom = true;
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
    session.atBottom = false;
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
});
