import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { TERMINAL_PROTOCOL, TERMINAL_REPLAY } from "@axon/protocol";
import { getCoreWebSocketUrl } from "../../renderer/shared/lib/coreBackend";

export interface TerminalSession {
  container: HTMLDivElement | null;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  ws: WebSocket | null;
  reconnectTimer: number | null;
  resizeDebounceTimer: number | null;
  resizeObserver: ResizeObserver | null;
  dataDisposable: { dispose: () => void } | null;
  multilineDisposable: { dispose: () => void } | null;
  scrollDisposable: { dispose: () => void } | null;
  workingDirectory: string | null;
  cwdSynced: boolean;
  receivedBytes: number;
  lastAckedBytes: number;
  ackTimer: number | null;
  outputQueue: TerminalOutputChunk[];
  outputWriting: boolean;
  outputDrainTimer: number | null;
  inFlightWriteBytes: number;
  pendingBinaryDecodes: number;
  queuedBytes: number;
  maxQueuedBytes: number;
  drainedChunks: number;
  reconnectCount: number;
  lastCloseCode: number | null;
  lastCloseReason: string;
  lastHealthUpdatedAt: number;
  inputQueue: string[];
  queuedInputBytes: number;
  scrollLine: number;
  atBottom: boolean;
  lastResizeCols: number | null;
  lastResizeRows: number | null;
  refreshFrame: number | null;
  heartbeatTimer: number | null;
  disposed: boolean;
  terminating: boolean;
}

export interface TerminalOutputChunk {
  data: string | Uint8Array;
  byteLength: number;
}

export const DEFAULT_TERMINAL_HEIGHT = 280;
export const MIN_TERMINAL_HEIGHT = 180;
export const MAX_RECONNECT_INPUT_BYTES =
  TERMINAL_REPLAY.maxReconnectInputBytes;
export const TERMINAL_ACK_BYTE_THRESHOLD = TERMINAL_REPLAY.ackByteThreshold;
export const TERMINAL_ACK_DEBOUNCE_MS = TERMINAL_REPLAY.ackDebounceMs;
// Core owns durable byte replay, but xterm still owns the live visible history.
// Long agent runs are judged by what the user can scroll back to in the
// terminal, so this stays large enough to avoid making older output disappear
// from the rendered buffer while core protects reconnect integrity underneath.
export const TERMINAL_SCROLLBACK_LINES = 200_000;
// xterm parses escape sequences on the renderer thread. Batching tiny websocket
// chunks helps throughput, but very large writes make the UI feel blocked while
// xterm tokenizes the buffer. 128KB is large enough to avoid thousands of small
// writes during agent streams while still giving the browser regular chances to
// handle input and paint.
export const TERMINAL_WRITE_BATCH_BYTES = 128 * 1024;
// This is the important part of the terminal-output architecture. Core keeps the
// durable append-only buffer, but the renderer must not serialize every chunk on
// a single xterm callback because that makes long agent runs crawl. At the same
// time, it also cannot push unbounded bytes into xterm because reconnect replay
// is only safe after xterm has actually committed the bytes. The in-flight cap is
// the middle ground: Axon can pipeline enough output to stay fast, but the
// backend still has a small, exact acknowledged cursor to replay from if the
// websocket detaches.
export const TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES = 4 * 1024 * 1024;
export const TERMINAL_MAX_WRITE_BATCHES_PER_DRAIN = 16;

export function createTerminalId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getFolderName(path: string | null) {
  if (!path) return "terminal";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "terminal";
}

export async function getTerminalBackendUrl(
  workingDirectory: string | null,
  sessionId: string,
  replayFrom = 0,
) {
  const backendUrl = await getCoreWebSocketUrl(TERMINAL_PROTOCOL.endpoint);
  backendUrl.searchParams.set(TERMINAL_PROTOCOL.query.sessionId, sessionId);
  backendUrl.searchParams.set(
    TERMINAL_PROTOCOL.query.replayFrom,
    String(replayFrom),
  );
  if (workingDirectory) {
    backendUrl.searchParams.set(TERMINAL_PROTOCOL.query.cwd, workingDirectory);
  }
  return backendUrl.toString();
}

export function quoteShellPath(path: string) {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

export function sendTerminate(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: TERMINAL_PROTOCOL.control.terminate }));
}

export function sendTerminalAck(session: TerminalSession, force = false) {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  if (session.receivedBytes <= session.lastAckedBytes) return;

  const pendingBytes = session.receivedBytes - session.lastAckedBytes;
  if (!force && pendingBytes < TERMINAL_ACK_BYTE_THRESHOLD) {
    if (session.ackTimer !== null) return;
    session.ackTimer = window.setTimeout(() => {
      session.ackTimer = null;
      sendTerminalAck(session, true);
    }, TERMINAL_ACK_DEBOUNCE_MS);
    return;
  }

  if (session.ackTimer !== null) {
    window.clearTimeout(session.ackTimer);
    session.ackTimer = null;
  }

  // The backend's replay cursor is byte-based, so Axon only acknowledges bytes
  // after xterm has completed its async write callback. A websocket message can
  // be received by the browser while xterm is still parsing escape sequences,
  // applying line wraps, or updating scrollback. Acknowledging at receipt time
  // would let core trim/replay from bytes the terminal view has not actually
  // committed yet, which is exactly how long agent streams appear to lose text.
  session.ws.send(
    JSON.stringify({
      type: TERMINAL_PROTOCOL.control.ack,
      offset: session.receivedBytes,
    }),
  );
  session.lastAckedBytes = session.receivedBytes;
}

export function getOutputByteLength(data: unknown) {
  if (typeof data === "string") {
    // Terminal input/output is overwhelmingly ASCII, but reconnect replay must
    // count real UTF-8 bytes because the backend scrollback offsets are byte
    // based. Walking code points avoids allocating a TextEncoder result on
    // every keystroke while still keeping emoji and non-Latin text aligned with
    // the server's replay cursor.
    let byteLength = 0;
    for (let index = 0; index < data.length; index += 1) {
      const codePoint = data.codePointAt(index) ?? 0;
      if (codePoint > 0xffff) index += 1;
      if (codePoint < 0x80) {
        byteLength += 1;
      } else if (codePoint < 0x800) {
        byteLength += 2;
      } else if (codePoint < 0x10000) {
        byteLength += 3;
      } else {
        byteLength += 4;
      }
    }
    return byteLength;
  }
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (data instanceof Blob) return data.size;
  return 0;
}
