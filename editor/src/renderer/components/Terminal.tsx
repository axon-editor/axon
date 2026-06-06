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
import type { BuiltInThemeId, EditorSettings } from "../../shared/settings";
import { editorFontStack } from "../lib/fonts";
import { type EditorDiagnostic } from "../lib/diagnostics";
import { type ResolvedThemeTokens } from "../lib/themeTokens";
import ChromeTab from "./ChromeTab";
import Tooltip from "./Tooltip";
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
  resizeObserver: ResizeObserver | null;
  dataDisposable: { dispose: () => void } | null;
  workingDirectory: string | null;
  cwdSynced: boolean;
}

const TERMINAL_BACKEND_URL = "ws://localhost:7777/terminal";
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

function getTerminalBackendUrl(workingDirectory: string | null) {
  if (!workingDirectory) return TERMINAL_BACKEND_URL;
  return `${TERMINAL_BACKEND_URL}?cwd=${encodeURIComponent(workingDirectory)}`;
}

function quoteShellPath(path: string) {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function sendWorkspaceCd(session: TerminalSession) {
  if (!session.workingDirectory || !session.ws) return;
  if (session.ws.readyState !== WebSocket.OPEN) return;

  // The backend receives cwd in the websocket URL, but this renderer fallback
  // covers a running dev backend that has not been restarted yet. Chaining
  // clear after cd removes the echoed startup command and first wrong prompt,
  // so the terminal opens on a clean prompt in the workspace folder.
  session.ws.send(`cd -- ${quoteShellPath(session.workingDirectory)} && clear\r`);
  session.cwdSynced = true;
}

function getTerminalOptions(
  editorSettings: EditorSettings,
  themeTokens: ResolvedThemeTokens,
) {
  return {
    theme: {
      ...terminalThemes[editorSettings.themeId],
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

  const disposeSession = useCallback((id: string) => {
    const session = sessionsRef.current[id];

    session?.resizeObserver?.disconnect();
    session?.dataDisposable?.dispose();
    if (session?.ws) {
      session.ws.onopen = null;
      session.ws.onmessage = null;
      session.ws.onclose = null;
      session.ws.onerror = null;
      session.ws.close();
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
      resizeObserver: null,
      dataDisposable: null,
      workingDirectory: sessionWorkingDirectory,
      cwdSynced: false,
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
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(container);
      fitAddon.fit();

      const ws = new WebSocket(
        getTerminalBackendUrl(session.workingDirectory),
      );

      session.term = term;
      session.fitAddon = fitAddon;
      session.ws = ws;

      ws.onopen = () => {
        updateTabConnection(id, true);
        sendResize(id);
        sendWorkspaceCd(session);
      };

      ws.onmessage = (event) => term.write(event.data);

      ws.onclose = () => {
        updateTabConnection(id, false);
        term.write("\r\n\x1b[31mconnection closed\x1b[0m\r\n");
      };

      ws.onerror = () => {
        term.write(
          "\r\n\x1b[31mfailed to connect to terminal backend\x1b[0m\r\n",
        );
      };

      // xterm's onData stream is the keyboard side of the PTY. Keeping one
      // websocket per tab lets every terminal have its own shell process,
      // which is why a new tab does not overwrite or steal another tab's work.
      session.dataDisposable = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Resize messages are sent only after fitting xterm to the visible
      // container. Without this, shells can render with stale dimensions after
      // toggling the panel, switching tabs, or dragging the window size.
      session.resizeObserver = new ResizeObserver(() => sendResize(id));
      session.resizeObserver.observe(container);
    },
    [sendResize, terminalOptions, updateTabConnection],
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
    for (const id of Object.keys(sessionsRef.current)) {
      const session = sessionsRef.current[id];
      if (!session.term) continue;

      session.term.options.theme = terminalOptions.theme;
      session.term.options.fontFamily = terminalOptions.fontFamily;
      session.term.options.fontWeight = terminalOptions.fontWeight;
      session.term.options.fontSize = terminalOptions.fontSize;
      session.term.options.lineHeight = terminalOptions.lineHeight;
      sendResize(id);
    }
  }, [sendResize, terminalOptions]);

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
