// Renders the bottom terminal panel and keeps terminal sessions independent
// from panel visibility. Hiding the panel should behave like minimizing it:
// shells keep running, scrollback stays in place, and only an explicit tab
// close tears down the websocket and PTY session.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { TERMINAL_PROTOCOL } from "@axon/protocol";
import {
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { EditorSettings } from "../../../shared/settings";
import { type EditorDiagnostic } from "../../../renderer/features/diagnostics/lib/diagnostics";
import { type ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import { waitForCoreBackend } from "../../../renderer/shared/lib/coreBackend";
import ChromeTab from "../../../renderer/features/editor/ChromeTab";
import Tooltip from "../../../renderer/shared/components/Tooltip";
import {
  BottomPanelContent,
  type OutputEntry,
  type BottomPanelTab,
} from "./BottomPanel";
import { getTerminalOptions } from "../../../platform/terminal/terminalTheme";
import {
  DEFAULT_TERMINAL_HEIGHT,
  MAX_RECONNECT_INPUT_BYTES,
  MIN_TERMINAL_HEIGHT,
  createTerminalId,
  getFolderName,
  getOutputByteLength,
  getTerminalBackendUrl,
  quoteShellPath,
  sendTerminalAck,
  sendTerminate,
  type TerminalSession,
} from "../../../platform/terminal/terminalProtocol";

interface Props {
  open: boolean;
  createNonce: number;
  createWorkingDirectory?: string | null;
  editorSettings: EditorSettings;
  themeTokens: ResolvedThemeTokens;
  workingDirectory: string | null;
  activePanelTab: "terminal" | BottomPanelTab;
  diagnostics: EditorDiagnostic[];
  outputEntries: OutputEntry[];
  onActivePanelTabChange: (tab: "terminal" | BottomPanelTab) => void;
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
  onRefreshDiagnostics: () => void;
  onClearOutput: () => void;
  onHide: () => void;
}

interface TerminalTab {
  id: string;
  title: string;
  connected: boolean;
}

function sendWorkspaceCd(session: TerminalSession) {
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

function isTerminalAtBottom(term: XTerm) {
  const buffer = term.buffer.active;
  return buffer.viewportY >= buffer.baseY - 1;
}

function scheduleTerminalRefresh(session: TerminalSession) {
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

function sendOrQueueTerminalInput(session: TerminalSession, data: string) {
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

function flushQueuedTerminalInput(session: TerminalSession) {
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

function writeTerminalOutput(session: TerminalSession, data: string | ArrayBuffer) {
  const chunk = {
    data: data instanceof ArrayBuffer ? new Uint8Array(data) : data,
    byteLength: getOutputByteLength(data),
  };
  session.outputQueue.push(chunk);
  session.queuedBytes += chunk.byteLength;
  drainTerminalOutput(session);
}

function hasPendingTerminalOutput(session: TerminalSession) {
  return session.outputWriting || session.queuedBytes > 0;
}

function isVisibleTerminalContainer(container: HTMLDivElement | null) {
  if (!container) return false;
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function terminateDetachedSession(
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

export default function Terminal({
  open,
  createNonce,
  createWorkingDirectory,
  editorSettings,
  themeTokens,
  workingDirectory,
  activePanelTab,
  diagnostics,
  outputEntries,
  onActivePanelTabChange,
  onOpenDiagnostic,
  onRefreshDiagnostics,
  onClearOutput,
  onHide,
}: Props) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
  const [zoomed, setZoomed] = useState(false);
  const sessionsRef = useRef<Record<string, TerminalSession>>({});
  const connectionAbortRef = useRef<Record<string, AbortController>>({});
  const lastCreateNonceRef = useRef(createNonce);
  const suppressAutoCreateRef = useRef(false);
  const previousOpenRef = useRef(open);
  const previousWorkingDirectoryRef = useRef(workingDirectory);
  const terminalTitle = useMemo(
    () => getFolderName(workingDirectory),
    [workingDirectory],
  );
  const terminalOptions = useMemo(
    () => getTerminalOptions(editorSettings, themeTokens),
    [editorSettings, themeTokens],
  );
  const panelOpen = open || activePanelTab !== "terminal";
  const terminalVisible = open && activePanelTab === "terminal";

  const sendResize = useCallback((id: string) => {
    const session = sessionsRef.current[id];
    if (!session?.fitAddon || !session.ws) return;
    if (!isVisibleTerminalContainer(session.container)) return;

    const wasAtBottom = session.term ? isTerminalAtBottom(session.term) : true;
    session.fitAddon.fit();
    const dims = session.fitAddon.proposeDimensions();
    if (
      dims &&
      session.ws.readyState === WebSocket.OPEN &&
      (dims.cols !== session.lastResizeCols || dims.rows !== session.lastResizeRows)
    ) {
      session.lastResizeCols = dims.cols;
      session.lastResizeRows = dims.rows;
      session.ws.send(
        JSON.stringify({
          type: TERMINAL_PROTOCOL.control.resize,
          cols: dims.cols,
          rows: dims.rows,
        }),
      );
    }
    if (session.term) {
      if (wasAtBottom || session.atBottom) {
        session.term.scrollToBottom();
      }
      scheduleTerminalRefresh(session);
    }
  }, []);

  const updateTabConnection = useCallback((id: string, connected: boolean) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === id ? { ...tab, connected } : tab)),
    );
  }, []);

  const resizeActiveTerminal = useCallback(() => {
    if (!activeTabId) return;
    window.requestAnimationFrame(() => sendResize(activeTabId));
  }, [activeTabId, sendResize]);

  const scheduleReconnect = useCallback(
    (session: TerminalSession, callback: () => void, delayMs: number) => {
      // A terminal websocket can close while output is still draining and while
      // a previous retry is already queued. Clearing the old timer here keeps
      // reconnect attempts single-file per session instead of stacking several
      // delayed `connectSession` calls against the same PTY.
      if (session.reconnectTimer) {
        window.clearTimeout(session.reconnectTimer);
      }
      session.reconnectTimer = window.setTimeout(callback, delayMs);
    },
    [],
  );

  const disposeSession = useCallback((id: string, terminate = true) => {
    const session = sessionsRef.current[id];

    connectionAbortRef.current[id]?.abort();
    delete connectionAbortRef.current[id];
    if (session?.reconnectTimer) {
      window.clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    if (session?.resizeDebounceTimer) {
      window.clearTimeout(session.resizeDebounceTimer);
      session.resizeDebounceTimer = null;
    }
    if (session?.ackTimer !== null && session?.ackTimer !== undefined) {
      window.clearTimeout(session.ackTimer);
      session.ackTimer = null;
    }
    if (session?.refreshFrame !== null && session?.refreshFrame !== undefined) {
      window.cancelAnimationFrame(session.refreshFrame);
      session.refreshFrame = null;
    }
    session?.resizeObserver?.disconnect();
    session?.dataDisposable?.dispose();
    session?.multilineDisposable?.dispose();
    session?.scrollDisposable?.dispose();
    if (session) {
      session.disposed = true;
      session.terminating = terminate;
    }
    if (session?.ws) {
      if (terminate) {
        sendTerminate(session.ws);
      }
      session.ws.onopen = null;
      session.ws.onmessage = null;
      session.ws.onclose = null;
      session.ws.onerror = null;
      session.ws.close();
    } else if (session && terminate) {
      terminateDetachedSession(session.workingDirectory, id);
    }
    session?.term?.dispose();
    delete sessionsRef.current[id];
  }, []);

  const disposeAllSessions = useCallback(() => {
    for (const id of Object.keys(sessionsRef.current)) {
      disposeSession(id);
    }
  }, [disposeSession]);

  const createTab = useCallback((sessionWorkingDirectory = workingDirectory) => {
    const id = createTerminalId();
    const title = getFolderName(sessionWorkingDirectory);
    suppressAutoCreateRef.current = false;

    setTabs((currentTabs) => [
      ...currentTabs,
      {
        id,
        title,
        connected: false,
      },
    ]);
    setActiveTabId(id);
    sessionsRef.current[id] = {
      container: null,
      term: null,
      fitAddon: null,
      ws: null,
      reconnectTimer: null,
      resizeDebounceTimer: null,
      resizeObserver: null,
      dataDisposable: null,
      multilineDisposable: null,
      scrollDisposable: null,
      workingDirectory: sessionWorkingDirectory,
      cwdSynced: false,
      receivedBytes: 0,
      lastAckedBytes: 0,
      ackTimer: null,
      outputQueue: [],
      outputWriting: false,
      queuedBytes: 0,
      inputQueue: [],
      queuedInputBytes: 0,
      scrollLine: 0,
      atBottom: true,
      lastResizeCols: null,
      lastResizeRows: null,
      refreshFrame: null,
      disposed: false,
      terminating: false,
    };
  }, [workingDirectory]);

  const closeTab = useCallback(
    (id: string) => {
      // Closing a tab is the only path that intentionally destroys a PTY.
      // The hide button leaves this cleanup path alone so long-running tasks
      // keep their state when the terminal panel is brought back.
      disposeSession(id);

      setTabs((currentTabs) => {
        const nextTabs = currentTabs.filter((tab) => tab.id !== id);

        if (nextTabs.length === 0) {
          suppressAutoCreateRef.current = true;
          setActiveTabId(null);
          setZoomed(false);
          onHide();
          return nextTabs;
        }

        setActiveTabId((currentActiveId) => {
          if (currentActiveId !== id) return currentActiveId;
          return nextTabs[nextTabs.length - 1]?.id ?? null;
        });
        return nextTabs;
      });
    },
    [disposeSession, onHide],
  );

  const handleHide = useCallback(() => {
    setZoomed(false);
    onHide();
  }, [onHide]);

  const handleZoomToggle = useCallback(() => {
    setZoomed((currentZoomed) => !currentZoomed);
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoomed) return;

      const startY = event.clientY;
      const startHeight = height;
      const maxHeight = Math.max(
        MIN_TERMINAL_HEIGHT,
        Math.floor(window.innerHeight * 0.78),
      );

      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextHeight = startHeight + startY - moveEvent.clientY;
        setHeight(Math.min(maxHeight, Math.max(MIN_TERMINAL_HEIGHT, nextHeight)));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [height, zoomed],
  );

  const connectSession = useCallback(
    (id: string) => {
      const session = sessionsRef.current[id];
      if (!session?.term || session.disposed) return;
      if (
        session.ws &&
        (session.ws.readyState === WebSocket.OPEN ||
          session.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      connectionAbortRef.current[id]?.abort();
      const abortController = new AbortController();
      connectionAbortRef.current[id] = abortController;

      void waitForCoreBackend(abortController.signal).then((ready) => {
        const currentSession = sessionsRef.current[id];
        if (abortController.signal.aborted || !currentSession?.term) return;
        if (currentSession.disposed) return;
        delete connectionAbortRef.current[id];

        if (!ready) {
          updateTabConnection(id, false);
          currentSession.term.write(
            "\r\n\x1b[31mterminal backend is not reachable. Axon will retry shortly.\x1b[0m\r\n",
          );
          scheduleReconnect(currentSession, () => connectSession(id), 1500);
          return;
        }

        const ws = new WebSocket(
          getTerminalBackendUrl(
            currentSession.workingDirectory,
            id,
            currentSession.receivedBytes,
          ),
        );
        ws.binaryType = "arraybuffer";
        currentSession.ws = ws;

        ws.onopen = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;
          updateTabConnection(id, true);
          sendResize(id);
          sendWorkspaceCd(latestSession);
          flushQueuedTerminalInput(latestSession);
          sendTerminalAck(latestSession, true);
        };

        ws.onmessage = (event) => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;

          if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then((buffer) => {
              const currentSession = sessionsRef.current[id];
              if (!currentSession || currentSession.disposed) return;
              if (currentSession.ws !== ws) return;
              writeTerminalOutput(currentSession, buffer);
            });
            return;
          }

          writeTerminalOutput(latestSession, event.data);
        };

        ws.onclose = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed || latestSession.terminating) {
            return;
          }
          if (latestSession.ws !== ws) return;

          latestSession.ws = null;
          updateTabConnection(id, false);
          // The shell process is owned by axon-core, not by the visible React
          // tab. A websocket close usually means the renderer view detached or
          // the backend connection blinked, so writing a reconnect banner into
          // the PTY buffer pollutes the user's real terminal history. VS Code
          // and Zed keep this reattach path silent; Axon should do the same and
          // only surface hard backend failures that require user action.
          const reconnectWhenOutputIsSettled = () => {
            const settledSession = sessionsRef.current[id];
            if (
              !settledSession ||
              settledSession.disposed ||
              settledSession.terminating
            ) {
              return;
            }

            if (hasPendingTerminalOutput(settledSession)) {
              scheduleReconnect(
                settledSession,
                reconnectWhenOutputIsSettled,
                80,
              );
              return;
            }

            scheduleReconnect(
              settledSession,
              () => connectSession(id),
              250,
            );
          };

          scheduleReconnect(
            latestSession,
            reconnectWhenOutputIsSettled,
            80,
          );
        };

        ws.onerror = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;
          latestSession.term?.write(
            "\r\n\x1b[31mfailed to connect to terminal backend\x1b[0m\r\n",
          );
        };
      });
    },
    [scheduleReconnect, sendResize, updateTabConnection],
  );

  const attachContainer = useCallback(
    (id: string, container: HTMLDivElement | null) => {
      const session = sessionsRef.current[id];
      if (!session) return;

      session.container = container;
      if (!container || session.term) return;

      const term = new XTerm({
        ...terminalOptions,
        cursorBlink: true,
        cursorStyle: "block",
        bracketedPasteMode: true,
        // Long-running AI sessions can produce far more output than a normal
        // shell command. A small scrollback makes xterm discard earlier lines,
        // which looks like the terminal randomly removed text while the user is
        // still reading or responding. Keeping a large scrollback makes Axon's
        // terminal behave closer to Zed/VS Code for chatty TUI tools.
        scrollback: 50000,
      });
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        // xterm's default web-link behavior uses browser navigation semantics,
        // which is wrong inside Electron because it can create an app window or
        // navigate the renderer. Routing through Axon's shell IPC keeps the
        // terminal like VS Code/Zed: URLs open in the user's default browser,
        // while the terminal buffer stays exactly where it was.
        event.preventDefault();
        event.stopPropagation();
        void window.axon.openExternalLink(uri).catch((err) => {
          console.error("failed to open terminal link:", err);
        });
      });

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(container);
      fitAddon.fit();

      session.term = term;
      session.fitAddon = fitAddon;
      session.scrollDisposable = term.onScroll((line) => {
        session.scrollLine = line;
        session.atBottom = isTerminalAtBottom(term);
      });
      connectSession(id);
      const handleMultilineKeydown = (event: KeyboardEvent) => {
        const isEnter =
          event.key === "Enter" ||
          event.key === "NumpadEnter" ||
          event.code === "Enter" ||
          event.code === "NumpadEnter";
        if (!isEnter || !event.shiftKey) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        term.paste("\n");
      };
      container.addEventListener("keydown", handleMultilineKeydown, true);
      session.multilineDisposable = {
        dispose: () =>
          container.removeEventListener("keydown", handleMultilineKeydown, true),
      };
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        const isEnter =
          event.key === "Enter" ||
          event.key === "NumpadEnter" ||
          event.code === "Enter" ||
          event.code === "NumpadEnter";
        if (isEnter && event.shiftKey) {
          // xterm's paste pipeline is safer than manually writing escape
          // sequences because it normalizes newlines for the PTY and only wraps
          // the text in bracketed-paste markers when the shell or TUI has
          // enabled that mode. The capture listener above catches the browser
          // event early, and this custom handler keeps the same behavior if
          // xterm processes the key first in a different platform path.
          term.paste("\n");
          return false;
        }

        const key = event.key.toLowerCase();
        const isClearShortcut =
          key === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
        if (!isClearShortcut) return true;

        // Shells normally receive Ctrl+L for clear-screen, but macOS editor
        // users expect Cmd+K in integrated terminals. xterm can clear its
        // scrollback locally without sending a fake command to the shell, so
        // the prompt/process state stays untouched.
        term.clear();
        return false;
      });

      // xterm's onData stream is the keyboard side of the PTY. Keeping one
      // websocket per tab lets every terminal have its own shell process,
      // which is why a new tab does not overwrite or steal another tab's work.
      session.dataDisposable = term.onData((data) => {
        sendOrQueueTerminalInput(session, data);
      });

      // Resize messages are sent only after fitting xterm to the visible
      // container. Without this, shells can render with stale dimensions after
      // toggling the panel, switching tabs, or dragging the window size.
      session.resizeObserver = new ResizeObserver(() => {
        if (session.resizeDebounceTimer) {
          window.clearTimeout(session.resizeDebounceTimer);
        }
        // ResizeObserver can fire several times during one React/layout pass.
        // Debouncing keeps xterm from repeatedly fitting, shrinking rows, and
        // shifting the viewport while agent output is still being written.
        session.resizeDebounceTimer = window.setTimeout(() => {
          session.resizeDebounceTimer = null;
          sendResize(id);
        }, 80);
      });
      session.resizeObserver.observe(container);
    },
    [connectSession, sendResize, terminalOptions],
  );

  useEffect(() => {
    if (previousWorkingDirectoryRef.current === workingDirectory) return;
    previousWorkingDirectoryRef.current = workingDirectory;

    // A terminal session belongs to the project that created it. When the user
    // opens another folder, we tear down the old PTYs instead of silently
    // changing their cwd, because running shell jobs and environment state
    // should not leak across projects.
    if (tabs.length > 0) {
      disposeAllSessions();
      setTabs([]);
      setActiveTabId(null);
      setZoomed(false);
      suppressAutoCreateRef.current = true;
      onHide();
    }
  }, [disposeAllSessions, onHide, tabs.length, workingDirectory]);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      suppressAutoCreateRef.current = false;
    }
    previousOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!terminalVisible || tabs.length > 0) return;
    if (suppressAutoCreateRef.current) return;
    if (createNonce !== lastCreateNonceRef.current) return;
    createTab();
  }, [createNonce, createTab, tabs.length, terminalVisible]);

  useEffect(() => {
    if (createNonce === lastCreateNonceRef.current) return;
    if (!terminalVisible) return;
    lastCreateNonceRef.current = createNonce;
    createTab(createWorkingDirectory ?? workingDirectory);
  }, [
    createNonce,
    createTab,
    createWorkingDirectory,
    terminalVisible,
    workingDirectory,
  ]);

  useEffect(() => {
    if (!terminalVisible) return;
    resizeActiveTerminal();
  }, [activeTabId, height, resizeActiveTerminal, terminalVisible, zoomed]);

  useEffect(() => {
    if (!terminalVisible || !activeTabId) return;
    const session = sessionsRef.current[activeTabId];
    if (!session?.term) return;

    window.requestAnimationFrame(() => {
      sendResize(activeTabId);
      if (session.term && session.atBottom) {
        session.term.scrollToBottom();
      } else if (session.term) {
        session.term.scrollToLine(
          Math.max(0, Math.min(session.scrollLine, session.term.buffer.active.baseY)),
        );
      }
    });
  }, [activeTabId, sendResize, terminalVisible]);

  useEffect(() => {
    for (const id of Object.keys(sessionsRef.current)) {
      const session = sessionsRef.current[id];
      if (!session.term) continue;

      session.term.options.theme = terminalOptions.theme;
      session.term.options.fontFamily = terminalOptions.fontFamily;
      session.term.options.fontWeight = terminalOptions.fontWeight;
      session.term.options.fontSize = terminalOptions.fontSize;
      session.term.options.lineHeight = terminalOptions.lineHeight;
      if (id === activeTabId && terminalVisible) {
        sendResize(id);
      }
    }
  }, [activeTabId, sendResize, terminalOptions, terminalVisible]);

  useEffect(() => {
    return () => {
      for (const id of Object.keys(sessionsRef.current)) {
        disposeSession(id);
      }
      sessionsRef.current = {};
    };
  }, [disposeSession]);

  if (!panelOpen && tabs.length === 0) return null;

  return (
    <div
      className={`${panelOpen ? "flex" : "hidden"} ${
        zoomed
          ? "absolute inset-0 z-30"
          : "relative z-10 shrink-0 border-t"
      } flex-col`}
      style={{
        height: zoomed ? "100%" : `${height}px`,
        background: terminalOptions.theme.background,
        color: terminalOptions.theme.foreground,
        borderColor: "var(--axon-panel-border)",
      }}
    >
      <div
        onPointerDown={handleResizeStart}
        className={`absolute left-0 right-0 top-0 h-1 ${
          zoomed
            ? "cursor-default"
            : "cursor-row-resize hover:bg-[#80c8e0]/60"
        }`}
        aria-hidden="true"
      />
      <div
        className="flex items-center justify-between border-b pl-3 pr-3 shrink-0"
        style={{ borderColor: "var(--axon-panel-border)" }}
      >
        <div className="flex min-w-0 flex-1 items-stretch gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#647086]">
            <SquareTerminal size={13} />
            <span>{terminalTitle}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-hidden">
            {tabs.map((tab) => (
              <ChromeTab
                key={tab.id}
                label={tab.title}
                active={activePanelTab === "terminal" && tab.id === activeTabId}
                closeLabel={`Close ${tab.title}`}
                onClick={() => {
                  setActiveTabId(tab.id);
                  onActivePanelTabChange("terminal");
                }}
                onClose={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              />
            ))}
            <Tooltip label="New terminal tab (plus)" side="top">
              <button
                onClick={() => {
                  onActivePanelTabChange("terminal");
                  createTab();
                }}
                aria-label="New terminal tab"
                className="my-1 cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white"
              >
                <Plus size={13} />
              </button>
            </Tooltip>
            <button
              onClick={() => onActivePanelTabChange("problems")}
              className={`my-1 cursor-pointer rounded px-2 text-[12px] transition-colors ${
                activePanelTab === "problems"
                  ? "bg-[#1e2430] text-white"
                  : "text-neutral-500 hover:bg-[#151923] hover:text-white"
              }`}
            >
              Problems
              <span className="ml-1 rounded bg-[#151923] px-1 text-[10px] text-[#586478]">
                {diagnostics.length}
              </span>
            </button>
            <button
              onClick={() => onActivePanelTabChange("output")}
              className={`my-1 cursor-pointer rounded px-2 text-[12px] transition-colors ${
                activePanelTab === "output"
                  ? "bg-[#1e2430] text-white"
                  : "text-neutral-500 hover:bg-[#151923] hover:text-white"
              }`}
            >
              Output
              {outputEntries.length > 0 && (
                <span className="ml-1 rounded bg-[#151923] px-1 text-[10px] text-[#586478]">
                  {outputEntries.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="ml-2 flex shrink-0 items-center gap-1">
          {activePanelTab === "problems" && (
            <Tooltip label="Refresh diagnostics" side="top">
              <button
                onClick={onRefreshDiagnostics}
                aria-label="Refresh diagnostics"
                className="cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white"
              >
                <RefreshCw size={13} />
              </button>
            </Tooltip>
          )}
          {activePanelTab === "output" && (
            <Tooltip label="Clear output" side="top">
              <button
                onClick={onClearOutput}
                aria-label="Clear output"
                className="cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white"
              >
                <Trash2 size={13} />
              </button>
            </Tooltip>
          )}
          <Tooltip
            label={zoomed ? "Restore terminal (panel)" : "Zoom terminal (panel)"}
            side="top"
          >
            <button
              onClick={handleZoomToggle}
              aria-label={zoomed ? "Restore terminal" : "Zoom terminal"}
              className="cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white"
            >
              {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </Tooltip>
          <Tooltip label="Hide terminal (Cmd+J)" side="top">
            <button
              onClick={handleHide}
              aria-label="Hide terminal"
              className="cursor-pointer rounded p-1 text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white"
            >
              <Minus size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden px-2 py-1">
        {activePanelTab !== "terminal" && (
          <BottomPanelContent
            activeTab={activePanelTab}
            diagnostics={diagnostics}
            outputEntries={outputEntries}
            onOpenDiagnostic={onOpenDiagnostic}
          />
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(node) => attachContainer(tab.id, node)}
            className={`h-full w-full overflow-hidden ${
              activePanelTab === "terminal" && tab.id === activeTabId
                ? "block"
                : "hidden"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
