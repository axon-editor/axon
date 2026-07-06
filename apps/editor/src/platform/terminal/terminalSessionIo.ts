import { Terminal as XTerm } from "@xterm/xterm";
import {
  MAX_RECONNECT_INPUT_BYTES,
  TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES,
  TERMINAL_MAX_WRITE_BATCHES_PER_DRAIN,
  TERMINAL_WRITE_BATCH_BYTES,
  getOutputByteLength,
  getTerminalBackendUrl,
  quoteShellPath,
  sendTerminalAck,
  sendTerminate,
  type TerminalSession,
} from "@axon-editor/platform/terminal/terminalProtocol";

export function sendWorkspaceCd(session: TerminalSession) {
  if (!session.ws) return;
  if (session.ws.readyState !== WebSocket.OPEN) return;
  if (session.cwdSynced) return;

  const commands: string[] = [];
  if (session.workingDirectory) {
    // Prefixing with a space is intentional. Shells configured with
    // HISTCONTROL=ignorespace or the equivalent zsh HISTIGNORE pattern will
    // skip Axon's automatic workspace cd, so reconnect/setup noise is less
    // likely to pollute the user's real command history.
    commands.push(` cd -- ${quoteShellPath(session.workingDirectory)}`);
  }

  // Axon should not inject command-specific shell setup here. The backend
  // starts the user's real login interactive shell so aliases, functions,
  // version managers, and installed commands come from the user's own shell
  // files. This renderer only keeps the prompt visually clean after choosing
  // the workspace directory.
  commands.push(" clear");
  session.ws.send(`${commands.join("; ")}\r`);
  session.cwdSynced = true;
}

export function isTerminalAtBottom(term: XTerm) {
  const buffer = term.buffer.active;
  return buffer.viewportY >= buffer.baseY - 1;
}

export function scheduleTerminalRefresh(session: TerminalSession) {
  // xterm already batches normal writes internally. This explicit refresh is
  // only a paint nudge for the cases where xterm has parsed output into its
  // buffer but the renderer has not advanced the visible rows yet. The
  // requestAnimationFrame guard is the important throttle: callers can request
  // refreshes from every write callback or heartbeat tick, and the browser will
  // still collapse them into at most one repaint per frame.
  if (!session.term || session.refreshFrame !== null) return;

  session.refreshFrame = window.requestAnimationFrame(() => {
    session.refreshFrame = null;
    if (!session.term || session.disposed) return;
    session.term.refresh(0, Math.max(0, session.term.rows - 1));
  });
}

function clearTerminalHeartbeat(session: TerminalSession) {
  if (session.heartbeatTimer === null) return;
  window.clearInterval(session.heartbeatTimer);
  session.heartbeatTimer = null;
}

function ensureTerminalHeartbeat(session: TerminalSession) {
  if (session.heartbeatTimer !== null) return;

  // A busy agent can keep xterm's async write callback delayed long enough
  // that relying on callback-driven refreshes alone still leaves the DOM
  // visually stale. This heartbeat is deliberately small and bounded: it only
  // runs while output is pending, and each tick goes through the same rAF
  // coalescing as normal refreshes, so it cannot spin into one refresh per
  // websocket chunk.
  session.heartbeatTimer = window.setInterval(() => {
    if (session.disposed || !hasPendingTerminalOutput(session)) {
      clearTerminalHeartbeat(session);
      return;
    }
    scheduleTerminalRefresh(session);
  }, 120);
}

export function sendOrQueueTerminalInput(
  session: TerminalSession,
  data: string,
) {
  // Keystrokes should survive a short websocket reconnect. Without this small
  // buffer, typing during a backend blink silently drops input, which feels
  // like the terminal is eating commands even though the shell is still alive.
  if (session.ws?.readyState === WebSocket.OPEN) {
    session.ws.send(data);
    return;
  }

  const byteLength = getOutputByteLength(data);
  if (session.queuedInputBytes + byteLength > MAX_RECONNECT_INPUT_BYTES) {
    return;
  }
  session.inputQueue.push(data);
  session.queuedInputBytes += byteLength;
}

export function flushQueuedTerminalInput(session: TerminalSession) {
  // Input is flushed only after the replacement websocket is open. This keeps
  // the PTY stream ordered: reconnect first, restore dimensions/cwd, then send
  // the user input collected while the view was detached.
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  while (session.inputQueue.length > 0) {
    const data = session.inputQueue.shift() ?? "";
    session.queuedInputBytes = Math.max(
      0,
      session.queuedInputBytes - getOutputByteLength(data),
    );
    session.ws.send(data);
  }
}

function takeTerminalOutputBatch(session: TerminalSession) {
  const firstChunk = session.outputQueue.shift();
  if (!firstChunk) return null;

  const chunks = [firstChunk];
  let byteLength = firstChunk.byteLength;

  while (session.outputQueue.length > 0) {
    const nextChunk = session.outputQueue[0];
    if (byteLength + nextChunk.byteLength > TERMINAL_WRITE_BATCH_BYTES) break;
    chunks.push(session.outputQueue.shift()!);
    byteLength += nextChunk.byteLength;
  }

  if (chunks.length === 1) {
    return {
      data: firstChunk.data,
      byteLength,
      chunkCount: 1,
    };
  }

  const allStrings = chunks.every((chunk) => typeof chunk.data === "string");
  if (allStrings) {
    return {
      data: chunks.map((chunk) => chunk.data).join(""),
      byteLength,
      chunkCount: chunks.length,
    };
  }

  const data = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (typeof chunk.data === "string") {
      // Mixed string/binary batches are rare, but Blob replay and normal text
      // output can meet during reconnect. Encoding the string here preserves
      // byte-exact replay accounting while still letting xterm parse one larger
      // write instead of many tiny writes.
      const encoded = new TextEncoder().encode(chunk.data);
      data.set(encoded, offset);
      offset += encoded.byteLength;
    } else {
      data.set(chunk.data, offset);
      offset += chunk.data.byteLength;
    }
  }

  return {
    data,
    byteLength,
    chunkCount: chunks.length,
  };
}

function clearTerminalDrainTimer(session: TerminalSession) {
  if (session.outputDrainTimer === null) return;
  window.clearTimeout(session.outputDrainTimer);
  session.outputDrainTimer = null;
}

function scheduleTerminalDrain(session: TerminalSession) {
  if (session.outputDrainTimer !== null || session.disposed) return;

  // A drain can intentionally stop after a bounded number of writes so a huge
  // replay cannot monopolize one event-loop turn. If there is still room under
  // the in-flight cap, this timer resumes the drain on the next turn without
  // waiting for xterm callbacks to serially unlock the whole stream.
  session.outputDrainTimer = window.setTimeout(() => {
    session.outputDrainTimer = null;
    drainTerminalOutput(session);
  }, 0);
}

function drainTerminalOutput(session: TerminalSession) {
  if (!session.term || session.disposed) return;

  let batchesWritten = 0;
  while (
    session.outputQueue.length > 0 &&
    session.inFlightWriteBytes < TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES &&
    batchesWritten < TERMINAL_MAX_WRITE_BATCHES_PER_DRAIN
  ) {
    const batch = takeTerminalOutputBatch(session);
    if (!batch) break;

    // queuedBytes represents bytes that have not reached xterm's write callback
    // yet, so I keep it high while the write is merely queued inside xterm. This
    // is what makes reconnect replay exact: if the websocket closes while xterm
    // is still parsing a batch, Axon waits and reconnects from the last committed
    // byte instead of pretending the browser already painted it.
    session.outputWriting = true;
    session.inFlightWriteBytes += batch.byteLength;
    session.atBottom = session.term ? isTerminalAtBottom(session.term) : true;
    batchesWritten += 1;

    session.term.write(batch.data, () => {
      session.receivedBytes += batch.byteLength;
      session.inFlightWriteBytes = Math.max(
        0,
        session.inFlightWriteBytes - batch.byteLength,
      );
      session.queuedBytes = Math.max(0, session.queuedBytes - batch.byteLength);
      session.drainedChunks += batch.chunkCount;
      session.outputWriting = session.inFlightWriteBytes > 0;

      const settled = !hasPendingTerminalOutput(session);
      sendTerminalAck(session, settled);
      if (session.term && session.atBottom) {
        session.term.scrollToBottom();
      }
      scheduleTerminalRefresh(session);

      if (settled) {
        clearTerminalHeartbeat(session);
        clearTerminalDrainTimer(session);
        return;
      }
      drainTerminalOutput(session);
    });
  }

  if (
    session.outputQueue.length > 0 &&
    session.inFlightWriteBytes < TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES
  ) {
    scheduleTerminalDrain(session);
  }
}

export function writeTerminalOutput(
  session: TerminalSession,
  data: string | ArrayBuffer,
) {
  const chunk = {
    data: data instanceof ArrayBuffer ? new Uint8Array(data) : data,
    byteLength: getOutputByteLength(data),
  };
  session.outputQueue.push(chunk);
  session.queuedBytes += chunk.byteLength;
  session.maxQueuedBytes = Math.max(session.maxQueuedBytes, session.queuedBytes);
  ensureTerminalHeartbeat(session);
  drainTerminalOutput(session);
}

export function hasPendingTerminalOutput(session: TerminalSession) {
  return (
    session.outputWriting ||
    session.outputDrainTimer !== null ||
    session.inFlightWriteBytes > 0 ||
    session.pendingBinaryDecodes > 0 ||
    session.outputQueue.length > 0 ||
    session.queuedBytes > 0
  );
}

export function isVisibleTerminalContainer(container: HTMLDivElement | null) {
  if (!container) return false;
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function terminateDetachedSession(
  workingDirectory: string | null,
  sessionId: string,
) {
  const ws = new WebSocket(getTerminalBackendUrl(workingDirectory, sessionId));
  ws.binaryType = "arraybuffer";
  const closeTimer = window.setTimeout(() => ws.close(), 1500);

  ws.onopen = () => {
    sendTerminate(ws);
    window.clearTimeout(closeTimer);
    ws.close();
  };
  ws.onerror = () => {
    window.clearTimeout(closeTimer);
    ws.close();
  };
}
