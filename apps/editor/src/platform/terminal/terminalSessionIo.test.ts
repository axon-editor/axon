import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOutputByteLength,
  type TerminalSession,
} from "./terminalProtocol";
import { hasPendingTerminalOutput, writeTerminalOutput } from "./terminalSessionIo";

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
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
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
  });
});
