import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { TERMINAL_PROTOCOL, TERMINAL_REPLAY } from "@axon/protocol";
import type { TerminalGpuAcceleration } from "../../shared/settings";
import { getCoreWebSocketUrl } from "../../renderer/shared/lib/coreBackend";

export interface TerminalRendererController {
  dispose: () => void;
  sync: (visible: boolean, mode: TerminalGpuAcceleration) => void;
}

export interface TerminalSession {
  container: HTMLDivElement | null;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  rendererController: TerminalRendererController | null;
  ws: WebSocket | null;
  reconnectTimer: number | null;
  connectionFailureCount: number;
  resizeDebounceTimer: number | null;
  resizeObserver: ResizeObserver | null;
  dataDisposable: { dispose: () => void } | null;
  multilineDisposable: { dispose: () => void } | null;
  workingDirectory: string | null;
  cwdSynced: boolean;
  receivedBytes: number;
  lastAckedBytes: number;
  ackTimer: number | null;
  pendingXtermWriteBytes: number;
  inputQueue: string[];
  queuedInputBytes: number;
  lastResizeCols: number | null;
  lastResizeRows: number | null;
  disposed: boolean;
  terminating: boolean;
}

export const DEFAULT_TERMINAL_HEIGHT = 280;
export const MIN_TERMINAL_HEIGHT = 180;
export const MAX_RECONNECT_INPUT_BYTES = TERMINAL_REPLAY.maxReconnectInputBytes;
export const TERMINAL_ACK_BYTE_THRESHOLD = TERMINAL_REPLAY.ackByteThreshold;
export const TERMINAL_ACK_DEBOUNCE_MS = TERMINAL_REPLAY.ackDebounceMs;
// Core owns durable byte replay, but xterm still owns the live visible history.
// Long agent runs are judged by what the user can scroll back to in the
// terminal, so this stays large enough to avoid making older output disappear
// from the rendered buffer while core protects reconnect integrity underneath.
export const TERMINAL_SCROLLBACK_LINES = 200_000;
export const TERMINAL_TICKET_RECONNECT_MIN_MS = 1_500;
export const TERMINAL_TICKET_RECONNECT_MAX_MS = 30_000;

export function getTerminalTicketReconnectDelay(failureCount: number) {
  const retryIndex = Math.max(0, Math.floor(failureCount) - 1);
  return Math.min(
    TERMINAL_TICKET_RECONNECT_MIN_MS * 2 ** Math.min(retryIndex, 5),
    TERMINAL_TICKET_RECONNECT_MAX_MS,
  );
}

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
  const backendUrl = await getCoreWebSocketUrl(
    TERMINAL_PROTOCOL.endpoint,
    workingDirectory,
  );
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
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (data instanceof Blob) return data.size;
  return 0;
}
