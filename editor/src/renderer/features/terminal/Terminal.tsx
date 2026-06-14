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
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
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
import type { BuiltInThemeId, EditorSettings } from "../../../shared/settings";
import { editorFontStack } from "../../shared/lib/fonts";
import { type EditorDiagnostic } from "../diagnostics/lib/diagnostics";
import { type ResolvedThemeTokens } from "../../shared/lib/themeTokens";
import { getCoreWebSocketUrl, waitForCoreBackend } from "../../shared/lib/coreBackend";
import ChromeTab from "../editor/ChromeTab";
import Tooltip from "../../shared/components/Tooltip";
import {
  BottomPanelContent,
  type OutputEntry,
  type BottomPanelTab,
} from "./BottomPanel";

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

interface TerminalSession {
  container: HTMLDivElement | null;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  ws: WebSocket | null;
  reconnectTimer: number | null;
  resizeObserver: ResizeObserver | null;
  dataDisposable: { dispose: () => void } | null;
  scrollDisposable: { dispose: () => void } | null;
  workingDirectory: string | null;
  cwdSynced: boolean;
  receivedBytes: number;
  scrollLine: number;
  disposed: boolean;
  terminating: boolean;
}

const DEFAULT_TERMINAL_HEIGHT = 280;
const MIN_TERMINAL_HEIGHT = 180;

const terminalThemes: Record<BuiltInThemeId, ITheme> = {
  "axon-dark": {
    background: "#0e1018",
    foreground: "#c8d0e0",
    cursor: "#80c8e0",
    cursorAccent: "#0e1018",
    selectionBackground: "#1e243080",
    black: "#0a0c12",
    brightBlack: "#364050",
    red: "#d0909c",
    brightRed: "#d0909c",
    green: "#90c8a0",
    brightGreen: "#90c8a0",
    yellow: "#d4b878",
    brightYellow: "#d4b878",
    blue: "#b0a0d8",
    brightBlue: "#b0a0d8",
    magenta: "#d0a888",
    brightMagenta: "#d0a888",
    cyan: "#80c8e0",
    brightCyan: "#80c8e0",
    white: "#c8d0e0",
    brightWhite: "#dce4f0",
  },
  sora: {
    background: "#10131a",
    foreground: "#d4dae7",
    cursor: "#7cc7d8",
    cursorAccent: "#10131a",
    selectionBackground: "#28304488",
    black: "#0a0d12",
    brightBlack: "#4b5565",
    red: "#f08c92",
    brightRed: "#ffadb1",
    green: "#8bd49c",
    brightGreen: "#a6e3b4",
    yellow: "#e5c07b",
    brightYellow: "#f2d69b",
    blue: "#8fb7ff",
    brightBlue: "#abc8ff",
    magenta: "#d7a3ff",
    brightMagenta: "#e4bdff",
    cyan: "#7cc7d8",
    brightCyan: "#9ee0ec",
    white: "#d4dae7",
    brightWhite: "#f0f4fb",
  },
  "catppuccin-mocha": {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    cursorAccent: "#1e1e2e",
    selectionBackground: "#585b7088",
    black: "#11111b",
    brightBlack: "#585b70",
    red: "#f38ba8",
    brightRed: "#f38ba8",
    green: "#a6e3a1",
    brightGreen: "#a6e3a1",
    yellow: "#f9e2af",
    brightYellow: "#f9e2af",
    blue: "#89b4fa",
    brightBlue: "#89b4fa",
    magenta: "#cba6f7",
    brightMagenta: "#cba6f7",
    cyan: "#94e2d5",
    brightCyan: "#94e2d5",
    white: "#cdd6f4",
    brightWhite: "#f5e0dc",
  },
  "zed-dark": {
    background: "#111316",
    foreground: "#d6d9df",
    cursor: "#7cc7e8",
    cursorAccent: "#111316",
    selectionBackground: "#2f3a4588",
    black: "#0d0f12",
    brightBlack: "#4d5562",
    red: "#ff9aa2",
    brightRed: "#ffb2b8",
    green: "#9fd68b",
    brightGreen: "#b7e8a6",
    yellow: "#e7c07a",
    brightYellow: "#f3d394",
    blue: "#7cc7e8",
    brightBlue: "#99d7f2",
    magenta: "#d7b7ff",
    brightMagenta: "#e2c8ff",
    cyan: "#72d0c9",
    brightCyan: "#95e3dd",
    white: "#d6d9df",
    brightWhite: "#f3f5f8",
  },
  "ayu-dark": {
    background: "#0b0e14",
    foreground: "#b3b1ad",
    cursor: "#ffcc66",
    cursorAccent: "#0b0e14",
    selectionBackground: "#27374788",
    black: "#01060e",
    brightBlack: "#5c6773",
    red: "#ea6c73",
    brightRed: "#f07178",
    green: "#aad94c",
    brightGreen: "#c2d94c",
    yellow: "#ffb454",
    brightYellow: "#ffcc66",
    blue: "#59c2ff",
    brightBlue: "#73d0ff",
    magenta: "#d2a6ff",
    brightMagenta: "#dfbfff",
    cyan: "#5ccfe6",
    brightCyan: "#95e6cb",
    white: "#b3b1ad",
    brightWhite: "#ffffff",
  },
};

function createTerminalId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getFolderName(path: string | null) {
  if (!path) return "terminal";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "terminal";
}

function getTerminalBackendUrl(
  workingDirectory: string | null,
  sessionId: string,
  replayFrom = 0,
) {
  const backendUrl = getCoreWebSocketUrl("/terminal");
  backendUrl.searchParams.set("sessionId", sessionId);
  backendUrl.searchParams.set("replayFrom", String(replayFrom));
  if (workingDirectory) {
    backendUrl.searchParams.set("cwd", workingDirectory);
  }
  return backendUrl.toString();
}

function quoteShellPath(path: string) {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function sendWorkspaceCd(session: TerminalSession) {
  if (!session.ws) return;
  if (session.ws.readyState !== WebSocket.OPEN) return;
  if (session.cwdSynced) return;

  const commands: string[] = [];
  if (session.workingDirectory) {
    commands.push(`cd -- ${quoteShellPath(session.workingDirectory)}`);
  }

  // Axon should not inject command-specific shell setup here. The backend
  // starts the user's real login interactive shell so aliases, functions,
  // version managers, and installed commands come from the user's own shell
  // files. This renderer only keeps the prompt visually clean after choosing
  // the workspace directory.
  commands.push("clear");
  session.ws.send(`${commands.join("; ")}\r`);
  session.cwdSynced = true;
}

function sendTerminate(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "terminate" }));
}

function getOutputByteLength(data: unknown) {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).length;
  }
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (data instanceof Blob) return data.size;
  return 0;
}

function writeTerminalOutput(session: TerminalSession, data: string | ArrayBuffer) {
  session.receivedBytes += getOutputByteLength(data);
  session.term?.write(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
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

function getTerminalOptions(
  editorSettings: EditorSettings,
  themeTokens: ResolvedThemeTokens,
) {
  return {
    theme: {
      ...(terminalThemes[editorSettings.themeId as BuiltInThemeId] ??
        terminalThemes["axon-dark"]),
      background: themeTokens["terminal.background"],
      foreground: themeTokens["terminal.foreground"],
    },
    fontFamily: editorFontStack(editorSettings.fontFamily),
    fontWeight: editorSettings.fontWeight,
    fontSize: Math.max(10, editorSettings.fontSize - 1),
    lineHeight: Math.max(
      1,
      editorSettings.lineHeight / editorSettings.fontSize,
    ),
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

    session.fitAddon.fit();
    const dims = session.fitAddon.proposeDimensions();
    if (dims && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(
        JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }),
      );
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

  const disposeSession = useCallback((id: string, terminate = true) => {
    const session = sessionsRef.current[id];

    connectionAbortRef.current[id]?.abort();
    delete connectionAbortRef.current[id];
    if (session?.reconnectTimer) {
      window.clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    session?.resizeObserver?.disconnect();
    session?.dataDisposable?.dispose();
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
      resizeObserver: null,
      dataDisposable: null,
      scrollDisposable: null,
      workingDirectory: sessionWorkingDirectory,
      cwdSynced: false,
      receivedBytes: 0,
      scrollLine: 0,
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
          currentSession.reconnectTimer = window.setTimeout(
            () => connectSession(id),
            1500,
          );
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
          updateTabConnection(id, true);
          sendResize(id);
          sendWorkspaceCd(currentSession);
        };

        ws.onmessage = (event) => {
          if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then((buffer) => {
              const latestSession = sessionsRef.current[id];
              if (!latestSession || latestSession.disposed) return;
              writeTerminalOutput(latestSession, buffer);
            });
            return;
          }

          writeTerminalOutput(currentSession, event.data);
        };

        ws.onclose = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed || latestSession.terminating) {
            return;
          }

          latestSession.ws = null;
          updateTabConnection(id, false);
          // The shell process is owned by axon-core, not by the visible React
          // tab. A websocket close usually means the renderer view detached or
          // the backend connection blinked, so writing a reconnect banner into
          // the PTY buffer pollutes the user's real terminal history. VS Code
          // and Zed keep this reattach path silent; Axon should do the same and
          // only surface hard backend failures that require user action.
          latestSession.reconnectTimer = window.setTimeout(
            () => connectSession(id),
            1000,
          );
        };

        ws.onerror = () => {
          const latestSession = sessionsRef.current[id];
          if (!latestSession || latestSession.disposed) return;
          latestSession.term?.write(
            "\r\n\x1b[31mfailed to connect to terminal backend\x1b[0m\r\n",
          );
        };
      });
    },
    [sendResize, updateTabConnection],
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
        scrollback: 4000,
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
      });
      connectSession(id);
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        if (event.key === "Enter" && event.shiftKey) {
          // zsh/bash treat Ctrl+V + Enter as a quoted newline. Mapping
          // Shift+Enter to that sequence gives Axon the editor-style multiline
          // terminal input users expect without teaching the renderer about
          // individual shell parsers.
          if (session.ws?.readyState === WebSocket.OPEN) {
            session.ws.send("\x16\r");
          }
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
        if (session.ws?.readyState === WebSocket.OPEN) {
          session.ws.send(data);
        }
      });

      // Resize messages are sent only after fitting xterm to the visible
      // container. Without this, shells can render with stale dimensions after
      // toggling the panel, switching tabs, or dragging the window size.
      session.resizeObserver = new ResizeObserver(() => sendResize(id));
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
      session.term?.scrollToLine(session.scrollLine);
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
            <Tooltip label="New terminal tab" side="top">
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
            label={zoomed ? "Restore terminal" : "Zoom terminal"}
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
          <Tooltip label="Hide terminal" side="top">
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
