// Renders the bottom terminal panel and keeps terminal sessions independent
// from panel visibility. Hiding the panel should behave like minimizing it:
// shells keep running, scrollback stays in place, and only an explicit tab
// close tears down the websocket and PTY session.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import type { EditorSettings } from "@axon-editor/shared/settings";
import {
  type BottomPanelTab,
  type OutputEntry,
} from "@axon-editor/platform/panel/bottomPanel";
import { type EditorDiagnostic } from "@axon-editor/renderer/features/diagnostics/lib/diagnostics";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { waitForCoreBackend } from "@axon-editor/renderer/shared/lib/coreBackend";
import ChromeTab from "@axon-editor/renderer/features/editor/ChromeTab";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import {
  BottomPanelContent,
} from "./BottomPanel";
import { type TerminalWorkbenchContribution } from "./contribution";
import { getTerminalOptions } from "@axon-editor/platform/terminal/terminalTheme";
import {
  DEFAULT_TERMINAL_HEIGHT,
  MIN_TERMINAL_HEIGHT,
  getFolderName,
} from "@axon-editor/platform/terminal/terminalProtocol";
import { useTerminalSessionManager } from "./useTerminalSessionManager";

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
  contribution: TerminalWorkbenchContribution;
  onActivePanelTabChange: (tab: "terminal" | BottomPanelTab) => void;
  onOpenDiagnostic: (diagnostic: EditorDiagnostic) => void;
  onRefreshDiagnostics: () => void;
  onClearOutput: () => void;
  onHide: () => void;
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
  contribution,
  onActivePanelTabChange,
  onOpenDiagnostic,
  onRefreshDiagnostics,
  onClearOutput,
  onHide,
}: Props) {
  const [height, setHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
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
  const {
    activeTabId,
    attachContainer,
    closeTab,
    createTab,
    resizeActiveTerminal,
    setActiveTabId,
    setZoomed,
    tabs,
    zoomed,
  } = useTerminalSessionManager({
    activePanelTab,
    createNonce,
    createWorkingDirectory,
    open,
    terminalOptions,
    terminalVisible,
    workingDirectory,
    onHide,
  });

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

  useEffect(() => {
    if (!terminalVisible) return;
    resizeActiveTerminal();
  }, [height, resizeActiveTerminal, terminalVisible, zoomed]);

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
            <span>{contribution.viewTitle}</span>
            <span className="max-w-[180px] truncate normal-case tracking-normal text-[10px] opacity-70">
              {terminalTitle}
            </span>
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
