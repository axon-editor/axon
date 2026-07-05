import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { TERMINAL_PROTOCOL } from "@axon/protocol";
import { waitForCoreBackend } from "@axon-editor/renderer/shared/lib/coreBackend";
import {
  createTerminalId,
  getFolderName,
  getTerminalBackendUrl,
  sendTerminalAck,
  sendTerminate,
  TERMINAL_SCROLLBACK_LINES,
  type TerminalSession,
} from "@axon-editor/platform/terminal/terminalProtocol";
import { type getTerminalOptions } from "@axon-editor/platform/terminal/terminalTheme";
import {
  flushQueuedTerminalInput,
  hasPendingTerminalOutput,
  isTerminalAtBottom,
  isVisibleTerminalContainer,
  scheduleTerminalRefresh,
  sendOrQueueTerminalInput,
  sendWorkspaceCd,
  terminateDetachedSession,
  writeTerminalOutput,
} from "@axon-editor/platform/terminal/terminalSessionIo";

export interface TerminalTab {
  id: string;
  title: string;
  connected: boolean;
  health: {
    receivedBytes: number;
    ackedBytes: number;
    queuedBytes: number;
    maxQueuedBytes: number;
    drainedChunks: number;
    reconnectCount: number;
    lastCloseCode: number | null;
    lastCloseReason: string;
  };
}

interface UseTerminalSessionManagerOptions {
  activePanelTab: string;
  createNonce: number;
  createWorkingDirectory?: string | null;
  open: boolean;
  terminalOptions: ReturnType<typeof getTerminalOptions>;
  terminalVisible: boolean;
  workingDirectory: string | null;
  onHide: () => void;
}

export function useTerminalSessionManager({
  createNonce,
  createWorkingDirectory,
  open,
  terminalOptions,
  terminalVisible,
  workingDirectory,
  onHide,
}: UseTerminalSessionManagerOptions) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const sessionsRef = useRef<Record<string, TerminalSession>>({});
  const connectionAbortRef = useRef<Record<string, AbortController>>({});
  const healthFrameRef = useRef<Record<string, number>>({});
  const lastCreateNonceRef = useRef(createNonce);
  const suppressAutoCreateRef = useRef(false);
  const previousOpenRef = useRef(open);
  const previousWorkingDirectoryRef = useRef(workingDirectory);

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

  const updateTabHealth = useCallback((id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              health: {
                receivedBytes: session.receivedBytes,
                ackedBytes: session.lastAckedBytes,
                queuedBytes: session.queuedBytes,
                maxQueuedBytes: session.maxQueuedBytes,
                drainedChunks: session.drainedChunks,
                reconnectCount: session.reconnectCount,
                lastCloseCode: session.lastCloseCode,
                lastCloseReason: session.lastCloseReason,
              },
            }
          : tab,
      ),
    );
  }, []);

  const scheduleTabHealthUpdate = useCallback(
    (id: string) => {
      if (healthFrameRef.current[id] !== undefined) return;
      healthFrameRef.current[id] = window.requestAnimationFrame(() => {
        delete healthFrameRef.current[id];
        updateTabHealth(id);
      });
    },
    [updateTabHealth],
  );

  const scheduleReconnect = useCallback(
    (session: TerminalSession, callback: () => void, delayMs: number) => {
      // A terminal websocket can close while output is still draining and while
      // a previous retry is already queued. Clearing the old timer here keeps
      // reconnect attempts single-file per session instead of stacking several
      // delayed connection attempts against the same PTY.
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
    if (healthFrameRef.current[id] !== undefined) {
      window.cancelAnimationFrame(healthFrameRef.current[id]);
      delete healthFrameRef.current[id];
    }
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
        health: {
          receivedBytes: 0,
          ackedBytes: 0,
          queuedBytes: 0,
          maxQueuedBytes: 0,
          drainedChunks: 0,
          reconnectCount: 0,
          lastCloseCode: null,
          lastCloseReason: "",
        },
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
      pendingBinaryDecodes: 0,
      queuedBytes: 0,
      maxQueuedBytes: 0,
      drainedChunks: 0,
      reconnectCount: 0,
      lastCloseCode: null,
      lastCloseReason: "",
      lastHealthUpdatedAt: 0,
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
      // Closing a tab is the only path that intentionally destroys a PTY. The
      // hide button leaves this cleanup path alone so long-running tools keep
      // their state when the terminal panel is brought back.
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
          updateTabHealth(id);
        };

        ws.onmessage = (event) => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;

          if (event.data instanceof Blob) {
            latestSession.pendingBinaryDecodes += 1;
            void event.data.arrayBuffer().then((buffer) => {
              const currentSession = sessionsRef.current[id];
              if (!currentSession || currentSession.disposed) return;
              currentSession.pendingBinaryDecodes = Math.max(
                0,
                currentSession.pendingBinaryDecodes - 1,
              );
              if (currentSession.ws !== ws) return;
              writeTerminalOutput(currentSession, buffer);
              scheduleTabHealthUpdate(id);
            }).catch(() => {
              const currentSession = sessionsRef.current[id];
              if (!currentSession || currentSession.disposed) return;
              currentSession.pendingBinaryDecodes = Math.max(
                0,
                currentSession.pendingBinaryDecodes - 1,
              );
            });
            return;
          }

          writeTerminalOutput(latestSession, event.data);
          scheduleTabHealthUpdate(id);
        };

        ws.onclose = (event) => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed || latestSession.terminating) {
            return;
          }
          if (latestSession.ws !== ws) return;

          latestSession.ws = null;
          latestSession.reconnectCount += 1;
          latestSession.lastCloseCode = event.code;
          latestSession.lastCloseReason = event.reason;
          updateTabConnection(id, false);
          updateTabHealth(id);
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

            scheduleReconnect(settledSession, () => connectSession(id), 250);
          };

          scheduleReconnect(latestSession, reconnectWhenOutputIsSettled, 80);
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
    [
      scheduleReconnect,
      scheduleTabHealthUpdate,
      sendResize,
      updateTabConnection,
      updateTabHealth,
    ],
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
        ignoreBracketedPasteMode: false,
        // Long-running local agents can produce far more output than a normal
        // shell session. Core protects reconnect replay by byte offset, while
        // xterm keeps the visible scrollback the user can inspect after a run.
        // This large live buffer is deliberate: shrinking it makes older rows
        // vanish from the terminal and feels like the process ate output.
        scrollback: TERMINAL_SCROLLBACK_LINES,
      });
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon((event, uri) => {
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
          // enabled that mode.
          term.paste("\n");
          return false;
        }

        const key = event.key.toLowerCase();
        const isClearShortcut =
          key === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
        if (!isClearShortcut) return true;

        term.clear();
        return false;
      });

      session.dataDisposable = term.onData((data) => {
        sendOrQueueTerminalInput(session, data);
      });

      session.resizeObserver = new ResizeObserver(() => {
        if (session.resizeDebounceTimer) {
          window.clearTimeout(session.resizeDebounceTimer);
        }
        session.resizeDebounceTimer = window.setTimeout(() => {
          session.resizeDebounceTimer = null;
          sendResize(id);
        }, 80);
      });
      session.resizeObserver.observe(container);
    },
    [connectSession, sendResize, terminalOptions],
  );

  const resizeActiveTerminal = useCallback(() => {
    if (!activeTabId) return;
    window.requestAnimationFrame(() => sendResize(activeTabId));
  }, [activeTabId, sendResize]);

  useEffect(() => {
    if (previousWorkingDirectoryRef.current === workingDirectory) return;
    previousWorkingDirectoryRef.current = workingDirectory;

    // A terminal session belongs to the project that created it. When the user
    // opens another folder, Axon tears down the old PTYs instead of silently
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
    if (!terminalVisible) return;

    const interval = window.setInterval(() => {
      for (const id of Object.keys(sessionsRef.current)) {
        const session = sessionsRef.current[id];
        if (!session.term) continue;
        if (!hasPendingTerminalOutput(session)) continue;
        session.lastHealthUpdatedAt = Date.now();
        updateTabHealth(id);
      }
    }, 750);

    return () => window.clearInterval(interval);
  }, [terminalVisible, updateTabHealth]);

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
      disposeAllSessions();
      sessionsRef.current = {};
    };
  }, [disposeAllSessions]);

  return {
    activeTabId,
    attachContainer,
    closeTab,
    createTab,
    resizeActiveTerminal,
    setActiveTabId,
    setZoomed,
    tabs,
    zoomed,
  };
}
