/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IBufferRange } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { TERMINAL_PROTOCOL } from "@axon/protocol";
import {
  createTerminalId,
  getTerminalTicketReconnectDelay,
  getFolderName,
  getTerminalBackendUrl,
  sendTerminalAck,
  sendTerminate,
  TERMINAL_SCROLLBACK_LINES,
  type TerminalSession,
} from "@axon-editor/platform/terminal/terminalProtocol";
import { type getTerminalOptions } from "@axon-editor/platform/terminal/terminalTheme";
import { type TerminalGpuAcceleration } from "@axon-editor/shared/settings";
import {
  flushQueuedTerminalInput,
  hasPendingTerminalOutput,
  isVisibleTerminalContainer,
  requestTerminalApplicationThemeRefresh,
  sendOrQueueTerminalInput,
  sendWorkspaceCd,
  terminateDetachedSession,
  writeTerminalOutput,
} from "@axon-editor/platform/terminal/terminalSessionIo";
import { createTerminalRendererController } from "./terminalRenderer";
import {
  getCommandSuggestionAcceptKey,
  shouldClearTerminal,
} from "./terminalShortcuts";
import { createTerminalSuggestionController } from "./terminalSuggestionOverlay";

export interface TerminalTab {
  id: string;
  title: string;
}

interface UseTerminalSessionManagerOptions {
  activePanelTab: string;
  commandSuggestions: boolean;
  createNonce: number;
  createWorkingDirectory?: string | null;
  gpuAcceleration: TerminalGpuAcceleration;
  open: boolean;
  terminalOptions: ReturnType<typeof getTerminalOptions>;
  terminalVisible: boolean;
  workingDirectory: string | null;
  onHide: () => void;
}

export function useTerminalSessionManager({
  commandSuggestions,
  createNonce,
  createWorkingDirectory,
  gpuAcceleration,
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
  const lastCreateNonceRef = useRef(createNonce);
  const suppressAutoCreateRef = useRef(false);
  const previousOpenRef = useRef(open);
  const previousWorkingDirectoryRef = useRef(workingDirectory);

  const openTerminalLink = useCallback((event: MouseEvent, uri: string) => {
    event.preventDefault();
    // xterm activates a link from its terminal-level `mouseup` listener, then
    // finishes text selection from a document-level listener for the same
    // event. Let the event bubble so xterm can remove the temporary drag
    // listeners before opening the external browser. Stopping propagation here
    // leaves selection active, so moving the pointer after returning to Axon
    // incorrectly extends a selection from the original link click.
    void window.axon.openExternalLink(uri).catch((err) => {
      console.error("failed to open terminal link:", err);
    });
  }, []);

  const sendResize = useCallback((id: string) => {
    const session = sessionsRef.current[id];
    if (!session?.fitAddon) return;
    if (!isVisibleTerminalContainer(session.container)) return;

    const term = session.term;
    const dims = session.fitAddon.proposeDimensions();
    const dimensionsChanged = Boolean(
      term && dims && (dims.cols !== term.cols || dims.rows !== term.rows),
    );
    if (dimensionsChanged) {
      session.fitAddon.fit();
    }
    if (
      dims &&
      session.ws?.readyState === WebSocket.OPEN &&
      (dims.cols !== session.lastResizeCols ||
        dims.rows !== session.lastResizeRows)
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
  }, []);

  const scheduleReconnect = useCallback(
    (session: TerminalSession, callback: () => void, delayMs: number) => {
      // A terminal websocket can close while xterm still has writes pending and
      // while a previous retry is already queued. Clearing the old timer here
      // keeps reconnect attempts single-file per session instead of stacking
      // several delayed connection attempts against the same PTY.
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
    session?.resizeObserver?.disconnect();
    session?.dataDisposable?.dispose();
    session?.multilineDisposable?.dispose();
    session?.suggestionController?.dispose();
    session?.rendererController?.dispose();
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
    try {
      session?.term?.dispose();
    } catch (err) {
      console.error("failed to dispose terminal session cleanly:", err);
    }
    delete sessionsRef.current[id];
  }, []);

  const disposeAllSessions = useCallback(() => {
    for (const id of Object.keys(sessionsRef.current)) {
      disposeSession(id);
    }
  }, [disposeSession]);

  const createTab = useCallback(
    (sessionWorkingDirectory = workingDirectory) => {
      const id = createTerminalId();
      const title = getFolderName(sessionWorkingDirectory);
      suppressAutoCreateRef.current = false;

      setTabs((currentTabs) => [
        ...currentTabs,
        {
          id,
          title,
        },
      ]);
      setActiveTabId(id);
      sessionsRef.current[id] = {
        container: null,
        term: null,
        fitAddon: null,
        rendererController: null,
        suggestionController: null,
        ws: null,
        reconnectTimer: null,
        connectionFailureCount: 0,
        resizeDebounceTimer: null,
        resizeObserver: null,
        dataDisposable: null,
        multilineDisposable: null,
        workingDirectory: sessionWorkingDirectory,
        cwdSynced: false,
        receivedBytes: 0,
        lastAckedBytes: 0,
        ackTimer: null,
        pendingXtermWriteBytes: 0,
        inputQueue: [],
        queuedInputBytes: 0,
        lastResizeCols: null,
        lastResizeRows: null,
        disposed: false,
        terminating: false,
      };
    },
    [workingDirectory],
  );

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

  const reorderTabs = useCallback((orderedIds: string[]) => {
    // Reordering is presentation only. Every tab keeps its own PTY, WebSocket,
    // and scrollback, so the drag must move nothing but the order of the ids
    // instead of rebuilding the session map.
    setTabs((currentTabs) => {
      const byId = new Map(currentTabs.map((tab) => [tab.id, tab]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((tab): tab is TerminalTab => tab !== undefined);
      if (reordered.length !== currentTabs.length) return currentTabs;
      return reordered;
    });
  }, []);

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

      void (async () => {
        const currentSession = sessionsRef.current[id];
        if (abortController.signal.aborted || !currentSession?.term) return;
        if (currentSession.disposed) return;

        let backendUrl: string;
        try {
          backendUrl = await getTerminalBackendUrl(
            currentSession.workingDirectory,
            id,
            currentSession.receivedBytes,
          );
        } catch (error) {
          if (abortController.signal.aborted) return;
          currentSession.connectionFailureCount += 1;
          if (
            currentSession.connectionFailureCount === 1 ||
            currentSession.connectionFailureCount % 5 === 0
          ) {
            // A missing backend used to write one identical console error per
            // terminal tab every 1.5 seconds forever. Keeping the first error
            // and periodic checkpoints preserves diagnostics without allowing
            // one service outage to drown every other renderer signal.
            console.error("terminal ticket request failed:", error);
          }
          delete connectionAbortRef.current[id];
          scheduleReconnect(
            currentSession,
            () => connectSession(id),
            getTerminalTicketReconnectDelay(
              currentSession.connectionFailureCount,
            ),
          );
          return;
        }
        if (abortController.signal.aborted || currentSession.disposed) return;
        currentSession.connectionFailureCount = 0;
        delete connectionAbortRef.current[id];

        const ws = new WebSocket(backendUrl);
        ws.binaryType = "arraybuffer";
        currentSession.ws = ws;

        ws.onopen = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;
          sendResize(id);
          sendWorkspaceCd(latestSession);
          flushQueuedTerminalInput(latestSession);
          sendTerminalAck(latestSession, true);
        };

        ws.onmessage = (event) => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          if (latestSession.ws !== ws) return;

          // binaryType is set to arraybuffer before the socket opens, so binary
          // PTY frames arrive synchronously in websocket order. Passing that
          // frame directly to xterm avoids an asynchronous Blob conversion that
          // could let a later frame overtake an earlier one.
          writeTerminalOutput(latestSession, event.data);
        };

        ws.onclose = () => {
          const latestSession = sessionsRef.current[id];
          if (
            !latestSession ||
            latestSession.disposed ||
            latestSession.terminating
          ) {
            return;
          }
          if (latestSession.ws !== ws) return;

          latestSession.ws = null;
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
      })();
    },
    [scheduleReconnect, sendResize],
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
        linkHandler: {
          activate: (event: MouseEvent, uri: string, _range: IBufferRange) =>
            openTerminalLink(event, uri),
        },
        // Long-running local agents can produce far more output than a normal
        // shell session. Core protects reconnect replay by byte offset, while
        // xterm keeps the visible scrollback the user can inspect after a run.
        // This large live buffer is deliberate: shrinking it makes older rows
        // vanish from the terminal and feels like the process ate output.
        scrollback: TERMINAL_SCROLLBACK_LINES,
      });
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon(openTerminalLink);

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(container);
      fitAddon.fit();

      session.term = term;
      session.fitAddon = fitAddon;
      session.rendererController = createTerminalRendererController(term, () =>
        sendResize(id),
      );
      session.rendererController.sync(
        terminalVisible && id === activeTabId,
        gpuAcceleration,
      );
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
        dispose: () => {
          container.removeEventListener(
            "keydown",
            handleMultilineKeydown,
            true,
          );
        },
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

        // Accepting has to win before the shell sees the key, otherwise Tab
        // would run zsh's own completion on top of the ghost text. Returning
        // false keeps xterm from encoding the key at all, and when nothing is
        // being suggested the key falls through to the shell untouched.
        if (session.suggestionController?.hasSuggestion()) {
          const acceptKey = getCommandSuggestionAcceptKey(event);
          if (acceptKey && session.suggestionController.accept(acceptKey)) {
            return false;
          }
        }

        if (!shouldClearTerminal(event)) return true;

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
    [
      activeTabId,
      connectSession,
      gpuAcceleration,
      openTerminalLink,
      sendResize,
      terminalOptions,
      terminalVisible,
    ],
  );

  const createSuggestionController = useCallback(
    (session: TerminalSession) => {
      if (!session.term || session.suggestionController) return;
      session.suggestionController = createTerminalSuggestionController({
        fontFamily: terminalOptions.fontFamily,
        fontSize: terminalOptions.fontSize,
        fontWeight: terminalOptions.fontWeight,
        term: session.term,
        // Accepting writes the rest of the command straight to the PTY instead of
        // pasting it, so the shell echoes and handles the inserted text exactly as
        // it would have if the user typed it by hand.
        onAccept: (text) => {
          sendOrQueueTerminalInput(session, text);
        },
      });
    },
    [terminalOptions],
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
    // Every route that hides the panel has to clear the zoom flag, including the
    // toggle command and zen mode. A panel that was zoomed when it went away
    // used to come back zoomed, which parked its controls in the window's top
    // strip and left the user without a reachable restore button.
    if (!open) setZoomed(false);
  }, [open, setZoomed]);

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
    for (const [id, session] of Object.entries(sessionsRef.current)) {
      const isActive = terminalVisible && id === activeTabId;
      session.rendererController?.sync(isActive, gpuAcceleration);
      if (commandSuggestions) {
        createSuggestionController(session);
      } else {
        // Turning the setting off has to reach terminals that are already open,
        // otherwise the toggle would only affect sessions created afterwards.
        session.suggestionController?.dispose();
        session.suggestionController = null;
      }
      // A suggestion belongs to the visible tab only. A hidden tab still has a
      // live shell, but its ghost would sit over a panel the user cannot see and
      // would be accepted by a Tab aimed at another terminal.
      session.suggestionController?.setVisible(isActive);
    }
  }, [
    activeTabId,
    commandSuggestions,
    createSuggestionController,
    gpuAcceleration,
    terminalVisible,
  ]);

  useEffect(() => {
    if (!terminalVisible || !activeTabId) return;
    const session = sessionsRef.current[activeTabId];
    if (!session?.term) return;

    // The active terminal is an interactive application surface. Restoring its
    // xterm textarea focus when the panel or tab becomes active keeps control
    // chords on xterm's normal keyboard pipeline instead of leaving focus on
    // the editor button that opened the panel. xterm remains responsible for
    // encoding the key according to the terminal application's active keyboard
    // protocol; Axon only establishes which surface owns the keyboard.
    session.term.focus();
    window.requestAnimationFrame(() => {
      sendResize(activeTabId);
    });
  }, [activeTabId, sendResize, terminalVisible]);

  useEffect(() => {
    for (const id of Object.keys(sessionsRef.current)) {
      const session = sessionsRef.current[id];
      if (!session.term) continue;

      const previousTheme = session.term.options.theme;
      const defaultColorsChanged = Boolean(
        previousTheme &&
          (previousTheme.background !== terminalOptions.theme.background ||
            previousTheme.foreground !== terminalOptions.theme.foreground),
      );

      // Assigning the palette through xterm's public theme option is the same
      // live-update path used by VS Code. xterm repaints its cells here and also
      // reports the new dark/light color scheme to applications that opted into
      // the standard DEC notification, so Axon must not rebuild the terminal or
      // manually repaint its canvas when the editor theme changes.
      session.term.options.theme = terminalOptions.theme;
      session.term.options.fontFamily = terminalOptions.fontFamily;
      session.term.options.fontWeight = terminalOptions.fontWeight;
      session.term.options.fontSize = terminalOptions.fontSize;
      session.term.options.lineHeight = terminalOptions.lineHeight;

      if (defaultColorsChanged && id === activeTabId && terminalVisible) {
        // Some long-running TUIs cache the default colors they queried when
        // they started. The active application needs to hear about the change
        // only after xterm owns the new palette, otherwise its immediate OSC
        // color query can race and read the old theme again. Hidden tabs receive
        // a real FocusIn from xterm when the user activates them later.
        requestTerminalApplicationThemeRefresh(session);
      }
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
    reorderTabs,
    resizeActiveTerminal,
    setActiveTabId,
    setZoomed,
    tabs,
    zoomed,
  };
}
