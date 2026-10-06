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
// markup. Header chrome lives in ./components/TerminalHeader, the floating
// modal's pointer geometry in ./hooks/useFloatingFrame, and the docked height
// drag in ./hooks/usePanelHeightResize.
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import "@xterm/xterm/css/xterm.css";
import "./styles/terminalSuggestion.css";
import type {
  EditorSettings,
  TerminalSettings,
} from "@axon-editor/shared/settings";
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
import { useFloatingFrame } from "./hooks/useFloatingFrame";
import { usePanelHeightResize } from "./hooks/usePanelHeightResize";
import { useTerminalSessionManager } from "./hooks/useTerminalSessionManager";
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
  // Clearance for the OS window controls (mac traffic lights, Windows caption
  // overlay) that float above the renderer. Only used while zoomed, since that
  // is the state that parks the header in the window's top strip.
  nativeControlInset?: {
    start: number;
    end: number;
  };
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
}: Props) {
  const terminalTitle = useMemo(
    () => getFolderName(workingDirectory),
    [workingDirectory],
  );
  const terminalOptions = useMemo(
    () => getTerminalOptions(editorSettings, themeTokens, terminalColors),
    [editorSettings, terminalColors, themeTokens],
  );
  const panelOpen = open || activePanelTab !== "terminal";
  const terminalVisible = open && activePanelTab === "terminal";
  const {
    activeTabId,
    attachContainer,
    closeTab,
    createTab,
    floating,
    reorderTabs,
    resizeActiveTerminal,
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
    workingDirectory,
    onHide,
  });

  useZoomedPanelEscape(zoomed, setZoomed);

  const { height, handleResizeStart } = usePanelHeightResize({
    floating,
    zoomed,
  });
  const {
    floatingGeometry,
    floatingRect,
    handleDockToggle,
    handleDragEnd,
    handleDragMove,
    handleDragStart,
    handleFloatingResizeStart,
    handleFloatingToggle,
    resizeHandles,
    terminalFrameRef,
  } = useFloatingFrame({ floating, setFloating, setZoomed });

  const handleHide = useCallback(() => {
    setZoomed(false);
    setFloating(false);
    onHide();
  }, [onHide, setFloating, setZoomed]);

  const handleZoomToggle = useCallback(() => {
    // Zoom fills the editor region from the top, and floating is already
    // floating over it. Letting both hold at once would leave no docked strip to
    // drag back from, so zooming first returns the panel to the bottom.
    if (!zoomed) setFloating(false);
    setZoomed((currentZoomed) => !currentZoomed);
  }, [setFloating, setZoomed, zoomed]);

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
  // shell keeps painting for the old box.
  useEffect(() => {
    if (!terminalVisible) return;
    resizeActiveTerminal();
  }, [
    floating,
    floatingRect,
    height,
    resizeActiveTerminal,
    terminalVisible,
    zoomed,
  ]);

  if (!panelOpen && tabs.length === 0) return null;

  return (
    <>
      {floating && (
        <FloatingDockNotice height={height} onDock={handleDockToggle}>
          {floatingNotice}
        </FloatingDockNotice>
      )}
      <div
        ref={terminalFrameRef}
        className={`${panelOpen ? "flex" : "hidden"} ${
          floating
            ? "fixed z-40 flex-col overflow-hidden rounded-lg border shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
            : zoomed
              ? "absolute inset-0 z-30"
              : "relative z-10 shrink-0 border-t"
        } flex-col`}
        style={{
          ...(floating
            ? floatingGeometry
            : { height: zoomed ? "100%" : `${height}px` }),
          background: terminalOptions.theme.background,
          color: terminalOptions.theme.foreground,
          borderColor: "var(--axon-panel-border)",
        }}
      >
        <div
          onPointerDown={handleResizeStart}
          className={`absolute -top-0.5 left-0 right-0 z-30 h-1 ${
            zoomed || floating
              ? "pointer-events-none"
              : "cursor-row-resize hover:bg-[#80c8e0]/60"
          }`}
          aria-hidden="true"
        />
        {floating &&
          resizeHandles.map(({ edge, cursor, className }) => (
            <div
              key={edge}
              data-edge={edge}
              onPointerDown={handleFloatingResizeStart}
              className={`absolute z-30 ${className}`}
              style={{ cursor }}
              aria-hidden="true"
            />
          ))}
        <TerminalHeader
          activePanelTab={activePanelTab}
          contribution={contribution}
          terminalTitle={terminalTitle}
          floating={floating}
          zoomed={zoomed}
          nativeControlInset={nativeControlInset}
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={handleTabSelect}
          onTabClose={closeTab}
          onTabReorder={reorderTabs}
          onNewTab={handleNewTab}
          onClearOutput={onClearOutput}
          onZoomToggle={handleZoomToggle}
          onFloatingToggle={handleFloatingToggle}
          onHide={handleHide}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
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
    </>
  );
}
