import { Terminal as XTerm } from "@xterm/xterm";
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

export function isTerminalAtBottom(term: XTerm) {
  const buffer = term.buffer.active;
  return buffer.viewportY >= buffer.baseY - 1;
}

export function scheduleTerminalRefresh(session: TerminalSession) {
  // xterm usually repaints after write callbacks, but heavy TUI output can
  // leave the DOM behind until a later resize/fit forces a refresh. Scheduling
  // one frame after each drained chunk keeps long-running agents visible while
  // still batching repaint work through requestAnimationFrame.
  if (!session.term || session.refreshFrame !== null) return;

  session.refreshFrame = window.requestAnimationFrame(() => {
    session.refreshFrame = null;
    if (!session.term || session.disposed) return;
    session.term.refresh(0, Math.max(0, session.term.rows - 1));
  });
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

function drainTerminalOutput(session: TerminalSession) {
  if (session.outputWriting) return;
  const chunk = session.outputQueue.shift();
  if (!chunk || !session.term || session.disposed) return;
  // Don't decrement queuedBytes here -- xterm hasn't processed it yet.
  // Decrementing early makes hasPendingTerminalOutput return false while
  // bytes are still inside xterm's internal write queue, which causes
  // reconnects to replay from the wrong offset and drop or duplicate output.

  session.outputWriting = true;
  session.atBottom = isTerminalAtBottom(session.term);
  session.term.write(chunk.data, () => {
    session.receivedBytes += chunk.byteLength;
    session.queuedBytes = Math.max(0, session.queuedBytes - chunk.byteLength);
    sendTerminalAck(session);
    if (session.term && session.atBottom) {
      session.term.scrollToBottom();
    }
    scheduleTerminalRefresh(session);
    session.outputWriting = false;
    drainTerminalOutput(session);
  });
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
  drainTerminalOutput(session);
}

export function hasPendingTerminalOutput(session: TerminalSession) {
  return session.outputWriting || session.queuedBytes > 0;
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
