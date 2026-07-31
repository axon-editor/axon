import { beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import {
  getOutputByteLength,
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
    buffer: { active: { viewportY: 0, baseY: 0 } },
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
    inFlightWriteBytes: 0,
    pendingBinaryDecodes: 0,
    queuedBytes: 0,
    maxQueuedBytes: 0,
    drainedChunks: 0,
    receivedBytes: 0,
    lastAckedBytes: 0,
    ackTimer: null,
    atBottom: true,
    refreshFrame: null,
    heartbeatTimer: null,
    disposed: false,
  } as unknown as TerminalSession;

  return { session, sent, written };
}

describe("terminal output accounting", () => {
  let animationFrames: FrameRequestCallback[];

  beforeEach(() => {
    animationFrames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
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

    animationFrames.splice(0).forEach((callback) => callback(0));
  });

  it("preserves live-follow intent while xterm's viewport transiently lags", () => {
    const { session } = createSession();
    const callbacks: Array<() => void> = [];
    const term = session.term!;
    vi.mocked(term.scrollToBottom).mockClear();
    term.write = vi.fn((_data, callback) => callbacks.push(callback));

    const buffer = term.buffer.active as { viewportY: number; baseY: number };
    buffer.viewportY = 10;
    buffer.baseY = 10;
    writeTerminalOutput(session, "first batch");

    // xterm can advance baseY before its visible viewport catches up. The user
    // has not scrolled here, so that transient coordinate mismatch must not turn
    // off the session's persistent live-follow intent.
    buffer.baseY = 20;
    writeTerminalOutput(session, "second batch");

    expect(callbacks).toHaveLength(2);
    callbacks[0]();
    callbacks[1]();
    animationFrames.splice(0).forEach((callback) => callback(0));

    expect(term.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not pull a detached reader back to the live tail", () => {
    const { session } = createSession();
    const term = session.term!;
    session.atBottom = false;
    vi.mocked(term.scrollToBottom).mockClear();

    writeTerminalOutput(session, "new output while reading scrollback");
    animationFrames.splice(0).forEach((callback) => callback(0));

    expect(term.scrollToBottom).not.toHaveBeenCalled();
    expect(term.refresh).toHaveBeenCalledTimes(1);
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
    animationFrames.splice(0).forEach((callback) => callback(0));
    terminal.scrollToBottom();
    terminal.scrollLines(-200);
    session.atBottom = false;
    const readingViewport = terminal.buffer.active.viewportY;

    writeTerminalOutput(session, createLines(8_000, 6_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    animationFrames.splice(0).forEach((callback) => callback(0));
    expect(terminal.buffer.active.viewportY).toBe(readingViewport);

    terminal.scrollToBottom();
    session.atBottom = true;
    writeTerminalOutput(session, createLines(14_000, 6_000));
    await vi.waitFor(() =>
      expect(hasPendingTerminalOutput(session)).toBe(false),
    );
    animationFrames.splice(0).forEach((callback) => callback(0));
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
});
