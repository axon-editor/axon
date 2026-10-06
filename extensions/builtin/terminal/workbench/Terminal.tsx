/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Renders the bottom terminal panel and keeps terminal sessions independent
// from panel visibility. Hiding the panel should behave like minimizing it:
// shells keep running, scrollback stays in place, and only an explicit tab
// close tears down the websocket and PTY session.
//
// This file is the wiring layer: session state, visibility, and the frame
// markup. Header chrome lives in ./components/TerminalHeader, the docked
// height drag in ./hooks/usePanelHeightResize, and the dedicated terminal
// window handshake in ./hooks/useTerminalWindowBridge. The floating flag
// means "the OS terminal window is open": the docked panel stays mounted
// behind a dock notice so its xterm buffers survive the move, and float opens
// or docks the window rather than moving the panel itself.
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import "@xterm/xterm/css/xterm.css";
import "./styles/terminalSuggestion.css";
import type {
  EditorSettings,
  TerminalSettings,
} from "@axon-editor/shared/settings";
import type { TerminalWindowHandoff } from "@axon-editor/shared/terminalWindow";
import {
  type BottomPanelTab,
  type OutputEntry,
} from "@axon-editor/platform/panel/bottomPanel";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { BottomPanelContent } from "./components/BottomPanel";
import FloatingDockNotice from "./components/FloatingDockNotice";
import TerminalHeader from "./components/TerminalHeader";
import { type TerminalWorkbenchContribution } from "./lib/contribution";
import { getTerminalOptions } from "@axon-editor/platform/terminal/terminalTheme";
import { getFolderName } from "@axon-editor/platform/terminal/terminalProtocol";
import { usePanelHeightResize } from "./hooks/usePanelHeightResize";
import { useTerminalSessionManager } from "./hooks/useTerminalSessionManager";
import { useTerminalWindowBridge } from "./hooks/useTerminalWindowBridge";
import { useZoomedPanelEscape } from "./hooks/useZoomedPanelEscape";

interface Props {
  open: boolean;
  createNonce: number;
  createWorkingDirectory?: string | null;
  editorSettings: EditorSettings;
  terminalSettings: TerminalSettings;
  terminalColors: Readonly<Record<string, string>>;
  themeTokens: ResolvedThemeTokens;
  workingDirectory: string | null;
  activePanelTab: "terminal" | BottomPanelTab;
  outputEntries: OutputEntry[];
  contribution: TerminalWorkbenchContribution;
  onActivePanelTabChange: (tab: "terminal" | BottomPanelTab) => void;
  onClearOutput: () => void;
  onHide: () => void;
  floatingNotice?: ReactNode;
  nativeControlInset?: {
    start: number;
    end: number;
  };
  // Terminal-as-window mode. The surface fills a dedicated Electron window that
  // owns its OS chrome, adopts the handed-off sessions as its initial state,
  // and reports its live snapshot back through onWindowStateRef when the window
  // asks to dock. The docked height drag and the editor's window bridge are
  // both inert here.
  windowed?: boolean;
  adoptHandoff?: TerminalWindowHandoff | null;
  onWindowDock?: () => void;
  onWindowHide?: () => void;
  onWindowStateRef?: (getState: () => TerminalWindowHandoff | null) => void;
}

export default function Terminal({
  open,
  createNonce,
  createWorkingDirectory,
  editorSettings,
  terminalSettings,
  terminalColors,
  themeTokens,
  workingDirectory,
  activePanelTab,
  outputEntries,
  contribution,
  onActivePanelTabChange,
  onClearOutput,
  onHide,
  floatingNotice,
  nativeControlInset = { start: 0, end: 0 },
  windowed = false,
  adoptHandoff,
  onWindowDock,
  onWindowHide,
  onWindowStateRef,
}: Props) {
  const terminalTitle = useMemo(
    () => getFolderName(workingDirectory),
    [workingDirectory],
  );
  const terminalOptions = useMemo(
    () => getTerminalOptions(editorSettings, themeTokens, terminalColors),
    [editorSettings, terminalColors, themeTokens],
  );
  const windowedMode = windowed === true;
  const panelOpen = windowedMode ? true : open || activePanelTab !== "terminal";
  const terminalVisible = windowedMode
    ? true
    : open && activePanelTab === "terminal";
  const {
    activeTabId,
    attachContainer,
    closeTab,
    createTab,
    floating,
    parkSessions,
    reorderTabs,
    resizeActiveTerminal,
    resumeSessions,
    serializeWindowSnapshot,
    setActiveTabId,
    setFloating,
    setZoomed,
    tabs,
    zoomed,
  } = useTerminalSessionManager({
    activePanelTab,
    commandSuggestions: terminalSettings.commandSuggestions,
    createNonce,
    createWorkingDirectory,
    gpuAcceleration: terminalSettings.gpuAcceleration,
    open,
    terminalOptions,
    terminalVisible,
    windowed,
    adoptHandoff,
    workingDirectory,
    onHide,
  });

  useZoomedPanelEscape(zoomed, setZoomed);

  const { height, handleResizeStart } = usePanelHeightResize({
    floating,
    zoomed,
  });
  const {
    dockTerminalWindow,
    hideTerminalWindow,
    toggleTerminalWindow,
  } = useTerminalWindowBridge({
    enabled: !windowedMode,
    open,
    floating,
    setFloating,
    onHide,
    parkSessions,
    resumeSessions,
    serializeSnapshot: serializeWindowSnapshot,
  });

  const handleHide = useCallback(() => {
    if (windowedMode) {
      onWindowHide?.();
      return;
    }
    if (floating) {
      // With the OS window open the panel's hide button is a handoff request:
      // dock the window back and keep the editor panel hidden.
      hideTerminalWindow();
      return;
    }
    setZoomed(false);
    onHide();
  }, [floating, hideTerminalWindow, onHide, onWindowHide, setZoomed, windowedMode]);

  const handleWindowDock = useCallback(() => {
    if (!windowedMode) return;
    onWindowDock?.();
  }, [onWindowDock, windowedMode]);

  const serializeGetterRef = useRef<() => TerminalWindowHandoff | null>(
    () => null,
  );
  serializeGetterRef.current = serializeWindowSnapshot;
  useEffect(() => {
    onWindowStateRef?.(() => serializeGetterRef.current());
  }, [onWindowStateRef]);

  const handleZoomToggle = useCallback(() => {
    setZoomed((currentZoomed) => !currentZoomed);
  }, [setZoomed]);

  const handleTabSelect = useCallback(
    (id: string) => {
      setActiveTabId(id);
      onActivePanelTabChange("terminal");
    },
    [onActivePanelTabChange, setActiveTabId],
  );

  const handleNewTab = useCallback(() => {
    onActivePanelTabChange("terminal");
    createTab();
  }, [createTab, onActivePanelTabChange]);

  // Dock/float/zoom swaps move the xterm container without a resize event on
  // it, so the fit has to be re-run by hand on every geometry change or the
  // shell keeps painting for the old box. floating is a dependency because the
  // parser hides the xterm body while the window owns the terminal, and coming
  // back after a dock needs a fresh fit against the restored panel size.
  useEffect(() => {
    if (!terminalVisible) return;
    resizeActiveTerminal();
  }, [floating, height, resizeActiveTerminal, terminalVisible, zoomed]);

  // The windowed surface always renders: an empty terminal is a valid window
  // with a + button, and the docked panel's null-out only applies in the editor.
  if (!windowedMode && !panelOpen && tabs.length === 0) return null;

  // While the OS window owns the terminal the panel collapses to the dock
  // notice bar and the header/body below are display:none, not unmounted: the
  // xterm instances must survive so resume replays only the floating delta.
  const terminalInWindow = floating && !windowedMode && activePanelTab === "terminal";

  return (
    <div
      className={`${panelOpen ? "flex" : "hidden"} ${
        windowedMode
          ? "absolute inset-0 z-0"
          : zoomed
            ? "absolute inset-0 z-30"
            : "relative z-10 shrink-0 border-t"
      } flex-col`}
      style={{
        height: windowedMode
          ? "100%"
          : zoomed
            ? "100%"
            : terminalInWindow
              ? "auto"
              : `${height}px`,
        background: terminalOptions.theme.background,
        color: terminalOptions.theme.foreground,
        borderColor: "var(--axon-panel-border)",
      }}
    >
      {terminalInWindow && (
        <FloatingDockNotice onDock={dockTerminalWindow}>
          {floatingNotice}
        </FloatingDockNotice>
      )}
      <div className={terminalInWindow ? "hidden" : "contents"}>
        {!windowedMode && (
          <div
            onPointerDown={handleResizeStart}
            className={`absolute -top-0.5 left-0 right-0 z-30 h-1 ${
              zoomed || floating
                ? "pointer-events-none"
                : "cursor-row-resize hover:bg-[#80c8e0]/60"
            }`}
            aria-hidden="true"
          />
        )}
        <TerminalHeader
          activePanelTab={activePanelTab}
          contribution={contribution}
          terminalTitle={terminalTitle}
          floating={floating}
          zoomed={zoomed}
          windowed={windowedMode}
          nativeControlInset={nativeControlInset}
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={handleTabSelect}
          onTabClose={closeTab}
          onTabReorder={reorderTabs}
          onNewTab={handleNewTab}
          onClearOutput={onClearOutput}
          onZoomToggle={handleZoomToggle}
          onFloatingToggle={windowedMode ? handleWindowDock : toggleTerminalWindow}
          onHide={handleHide}
        />

        <div className="relative z-0 flex-1 overflow-hidden px-2 py-1">
          {activePanelTab !== "terminal" && (
            <BottomPanelContent
              activeTab={activePanelTab}
              outputEntries={outputEntries}
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
    </div>
  );
}