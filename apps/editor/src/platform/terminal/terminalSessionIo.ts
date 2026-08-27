import {
  MAX_RECONNECT_INPUT_BYTES,
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

export function requestTerminalApplicationThemeRefresh(
  session: TerminalSession,
) {
  // Modern terminal applications can subscribe to xterm's DEC color-scheme
  // notifications, which xterm emits automatically when Axon replaces its
  // theme. Codex currently refreshes its queried OSC 10/11 colors on FocusIn
  // instead, so an agent that remains open would otherwise keep the previous
  // theme's explicitly rendered RGB backgrounds until focus changes naturally.
  //
  // I only send FocusIn after the application has enabled DECSET 1004. That
  // opt-in proves the foreground process understands focus reports and keeps
  // this compatibility path from writing an escape sequence into an ordinary
  // shell prompt. The signal is also never queued across reconnects: a stale
  // synthetic focus event must not reach a different foreground process later.
  if (!session.term?.modes.sendFocusMode) return false;
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return false;

  session.ws.send("\x1b[I");
  return true;
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

export function writeTerminalOutput(
  session: TerminalSession,
  data: string | ArrayBuffer,
) {
  if (!session.term || session.disposed) return;

  const byteLength = getOutputByteLength(data);
  if (byteLength === 0) return;
  const xtermData = typeof data === "string" ? data : new Uint8Array(data);

  // xterm has its own ordered write buffer and parser scheduler. Passing each
  // websocket frame straight through matches VS Code's terminal data path and
  // avoids creating a second queue whose batching boundaries and callbacks can
  // compete with xterm's rendering cadence. Axon tracks only the bytes awaiting
  // xterm's callback because that is the minimum state reconnect needs: core may
  // replay from receivedBytes only after xterm has committed those bytes.
  session.pendingXtermWriteBytes += byteLength;
  session.term.write(xtermData, () => {
    session.receivedBytes += byteLength;
    session.pendingXtermWriteBytes = Math.max(
      0,
      session.pendingXtermWriteBytes - byteLength,
    );
    sendTerminalAck(session, !hasPendingTerminalOutput(session));
  });
}

export function hasPendingTerminalOutput(session: TerminalSession) {
  return session.pendingXtermWriteBytes > 0;
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
