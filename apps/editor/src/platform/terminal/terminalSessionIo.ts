import type { Terminal as XTerm } from "@xterm/xterm";
import {
  MAX_RECONNECT_INPUT_BYTES,
  TERMINAL_HARD_REFRESH_IDLE_MS,
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

function takeTerminalOutputBatch(session: TerminalSession, maxBytes: number) {
  let firstChunk = session.outputQueue.shift();
  if (!firstChunk) return null;
  if (firstChunk.byteLength > maxBytes) {
    const bytes =
      typeof firstChunk.data === "string"
        ? new TextEncoder().encode(firstChunk.data)
        : firstChunk.data;
    const head = bytes.slice(0, maxBytes);
    const tail = bytes.slice(maxBytes);
    firstChunk = {
      data: head,
      byteLength: head.byteLength,
      queuedAtMs: firstChunk.queuedAtMs,
    };
    session.outputQueue.unshift({
      data: tail,
      byteLength: tail.byteLength,
      queuedAtMs: firstChunk.queuedAtMs,
    });
  }

  const chunks = [firstChunk];
  let byteLength = firstChunk.byteLength;
  const batchLimit = Math.min(TERMINAL_WRITE_BATCH_BYTES, maxBytes);

  while (session.outputQueue.length > 0) {
    const nextChunk = session.outputQueue[0];
    if (byteLength + nextChunk.byteLength > batchLimit) break;
    chunks.push(session.outputQueue.shift()!);
    byteLength += nextChunk.byteLength;
  }

  if (chunks.length === 1) {
    return {
      data: firstChunk.data,
      byteLength,
      chunkCount: 1,
      oldestQueuedAtMs: firstChunk.queuedAtMs,
    };
  }

  const allStrings = chunks.every((chunk) => typeof chunk.data === "string");
  if (allStrings) {
    return {
      data: chunks.map((chunk) => chunk.data).join(""),
      byteLength,
      chunkCount: chunks.length,
      oldestQueuedAtMs: Math.min(...chunks.map((chunk) => chunk.queuedAtMs)),
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
    oldestQueuedAtMs: Math.min(...chunks.map((chunk) => chunk.queuedAtMs)),
  };
}

function splitTerminalOutput(data: string | ArrayBuffer) {
  const queuedAtMs = performance.now();
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  if (bytes.byteLength <= TERMINAL_WRITE_BATCH_BYTES) {
    return [
      {
        data: typeof data === "string" ? data : bytes,
        byteLength: bytes.byteLength,
        queuedAtMs,
      },
    ];
  }

  const chunks = [];
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += TERMINAL_WRITE_BATCH_BYTES
  ) {
    const chunk = bytes.slice(
      offset,
      Math.min(offset + TERMINAL_WRITE_BATCH_BYTES, bytes.byteLength),
    );
    chunks.push({ data: chunk, byteLength: chunk.byteLength, queuedAtMs });
  }
  return chunks;
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

function scheduleTerminalHardRefresh(session: TerminalSession) {
  if (session.outputHardRefreshTimer !== null) {
    window.clearTimeout(session.outputHardRefreshTimer);
  }

  // A normal xterm refresh only marks rows dirty; WebGL may compare those rows
  // with an identical cached cell model and skip drawing them. Electron can
  // therefore retain a stale canvas even though xterm has committed every byte,
  // explaining why resizing reveals the missing output. Debouncing this deeper
  // renderer invalidation until the input burst is quiet avoids clearing the
  // glyph atlas repeatedly while an agent is actively streaming.
  session.outputHardRefreshTimer = window.setTimeout(() => {
    session.outputHardRefreshTimer = null;
    if (session.disposed) return;
    if (hasPendingTerminalOutput(session)) {
      scheduleTerminalHardRefresh(session);
      return;
    }
    session.rendererController?.forceFullRedraw();
  }, TERMINAL_HARD_REFRESH_IDLE_MS);
}

export function scheduleTerminalViewportRefresh(
  session: TerminalSession,
  verifyAfterPaint = false,
) {
  if (verifyAfterPaint) {
    session.outputRefreshAfterFrame = true;
  }
  if (session.outputRefreshFrame !== null || session.disposed || !session.term) {
    return;
  }

  // xterm normally invalidates visible rows as its parser commits output, but
  // Electron can leave a detached scrollback viewport stale while the buffer
  // keeps growing below it. I request one full visible-viewport repaint after
  // committed writes and coalesce every completion in the same animation frame.
  // This preserves the reader's exact scroll position because refresh does not
  // scroll, while the frame cap prevents a fast agent stream from scheduling a
  // separate renderer pass for every 128 KB write callback.
  session.outputRefreshFrame = window.requestAnimationFrame(() => {
    session.outputRefreshFrame = null;
    const refreshAfterFrame = session.outputRefreshAfterFrame;
    session.outputRefreshAfterFrame = false;
    const term = session.term;
    if (!term || session.disposed) return;
    term.refresh(0, Math.max(0, term.rows - 1));
    if (refreshAfterFrame) {
      // xterm's refresh invalidates the rows during this frame, while WebGL can
      // submit the resulting canvas on the next compositor frame. A second
      // repaint after the queue settles closes that one-frame gap for the final
      // line without adding another repaint to every write in a live stream.
      scheduleTerminalViewportRefresh(session);
    }
  });
}

function drainTerminalOutput(session: TerminalSession) {
  if (!session.term || session.disposed) return;

  let batchesWritten = 0;
  while (
    session.outputQueue.length > 0 &&
    session.inFlightWriteBytes < TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES &&
    batchesWritten < TERMINAL_MAX_WRITE_BATCHES_PER_DRAIN
  ) {
    const batch = takeTerminalOutputBatch(
      session,
      TERMINAL_MAX_IN_FLIGHT_WRITE_BYTES - session.inFlightWriteBytes,
    );
    if (!batch) break;

    // queuedBytes represents bytes that have not reached xterm's write callback
    // yet, so I keep it high while the write is merely queued inside xterm. This
    // is what makes reconnect replay exact: if the websocket closes while xterm
    // is still parsing a batch, Axon waits and reconnects from the last committed
    // byte instead of pretending the browser already painted it.
    session.outputWriting = true;
    session.inFlightWriteBytes += batch.byteLength;
    batchesWritten += 1;

    session.term.write(batch.data, () => {
      const commitLatencyMs = Math.max(
        0,
        performance.now() - batch.oldestQueuedAtMs,
      );
      session.lastWriteCommitLatencyMs = commitLatencyMs;
      session.maxWriteCommitLatencyMs = Math.max(
        session.maxWriteCommitLatencyMs ?? 0,
        commitLatencyMs,
      );
      session.receivedBytes += batch.byteLength;
      session.inFlightWriteBytes = Math.max(
        0,
        session.inFlightWriteBytes - batch.byteLength,
      );
      session.queuedBytes = Math.max(0, session.queuedBytes - batch.byteLength);
      session.drainedChunks += batch.chunkCount;
      session.outputWriting = session.inFlightWriteBytes > 0;

      const settled = !hasPendingTerminalOutput(session);
      scheduleTerminalViewportRefresh(session, settled);
      sendTerminalAck(session, settled);

      if (settled) {
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
  const chunks = splitTerminalOutput(data);
  const byteLength = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  session.outputQueue.push(...chunks);
  session.queuedBytes += byteLength;
  session.maxQueuedBytes = Math.max(
    session.maxQueuedBytes,
    session.queuedBytes,
  );
  drainTerminalOutput(session);
  scheduleTerminalHardRefresh(session);
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

export async function terminateDetachedSession(
  workingDirectory: string | null,
  sessionId: string,
) {
  const ws = new WebSocket(
    await getTerminalBackendUrl(workingDirectory, sessionId),
  );
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
