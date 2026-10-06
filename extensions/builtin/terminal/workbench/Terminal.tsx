/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Maximize2,
  Minimize2,
  Minus,
  MoveDiagonal2,
  PanelBottom,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react";
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
import {
  FLOATING_TRANSITION_EASING,
  FLOATING_TRANSITION_MS,
  clampFloatingRect,
  getDefaultFloatingRect,
  getFloatingDragPosition,
  type FloatingTerminalRect,
} from "./lib/floatingTerminal";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import { BottomPanelContent } from "./BottomPanel";
import TerminalTabBar from "./TerminalTabBar";
import { type TerminalWorkbenchContribution } from "./lib/contribution";
import { getTerminalOptions } from "@axon-editor/platform/terminal/terminalTheme";
import {
  DEFAULT_TERMINAL_HEIGHT,
  FLOATING_TERMINAL_MARGIN,
  MIN_TERMINAL_HEIGHT,
  getFolderName,
} from "@axon-editor/platform/terminal/terminalProtocol";
import { useTerminalSessionManager } from "./lib/useTerminalSessionManager";
import { useZoomedPanelEscape } from "./lib/useZoomedPanelEscape";

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
  // is the state that parks this header in the window's top strip.
  nativeControlInset?: {
    start: number;
    end: number;
  };
}

const terminalControlClassName =
  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white";

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
  const [height, setHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
  const [floatingRect, setFloatingRect] = useState<FloatingTerminalRect | null>(
    null,
  );
  const [floatingDragging, setFloatingDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const terminalFrameRef = useRef<HTMLDivElement>(null);
  const [floatingAnimating, setFloatingAnimating] = useState(false);
  const [floatingTransitionRect, setFloatingTransitionRect] =
    useState<FloatingTerminalRect | null>(null);
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

  const handleFloatingToggle = useCallback(() => {
    if (floating) {
      setFloating(false);
      setFloatingAnimating(false);
      setFloatingTransitionRect(null);
      return;
    }
    setZoomed(false);

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const target = getDefaultFloatingRect(viewport);
    const frame = terminalFrameRef.current;
    let start: FloatingTerminalRect | null = null;
    if (frame) {
      const rect = frame.getBoundingClientRect();
      start = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    } else {
      const fallback = target;
      start = {
        left: Math.max(
          FLOATING_TERMINAL_MARGIN,
          (viewport.width - fallback.width) / 2,
        ),
        top: Math.max(
          FLOATING_TERMINAL_MARGIN,
          (viewport.height - fallback.height) / 2,
        ),
        width: fallback.width,
        height: fallback.height,
      };
    }

    setFloatingTransitionRect(start);
    setFloatingAnimating(true);
    // Wait two frames so the browser renders the starting position before
    // switching to the target. Otherwise it computes layout once and flips
    // instantly, skipping the transition entirely.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFloatingRect(target);
        setFloating(true);
      });
    });

    window.setTimeout(() => {
      setFloatingTransitionRect(null);
      setFloatingAnimating(false);
    }, FLOATING_TRANSITION_MS + 16);
  }, [floating, setFloating, setZoomed]);  

  const handleDockToggle = useCallback(() => {
    setFloating(false);
  }, [setFloating]);

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingRect) return;
      dragOffsetRef.current = {
        x: event.clientX - floatingRect.left,
        y: event.clientY - floatingRect.top,
      };
      setFloatingDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [floatingRect],
  );

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingDragging || !floatingRect) return;
      const { left, top } = getFloatingDragPosition(
        { x: event.clientX, y: event.clientY },
        dragOffsetRef.current,
        { width: floatingRect.width, height: floatingRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setFloatingRect((currentRect) =>
        currentRect ? { ...currentRect, left, top } : currentRect,
      );
    },
    [floatingDragging, floatingRect],
  );

  const handleDragEnd = useCallback(() => {
    if (!floatingDragging) return;
    setFloatingDragging(false);
  }, [floatingDragging]);  



  const handleFloatingResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingRect) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = floatingRect;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setFloatingRect(
          clampFloatingRect(
            {
              left: startRect.left,
              top: startRect.top,
              width: startRect.width + moveEvent.clientX - startX,
              height: startRect.height + moveEvent.clientY - startY,
            },
            { width: window.innerWidth, height: window.innerHeight },
          ),
        );
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
    [floatingRect],
  );

  // Shrinking the Axon window can leave the floating frame hanging past the new
  // edge, and the resize handle can fall outside the frame the user is dragging.
  useEffect(() => {
    if (!floating || !floatingRect) return;
    const handleWindowResize = () => {
      setFloatingRect((currentRect) =>
        currentRect
          ? clampFloatingRect(currentRect, {
              width: window.innerWidth,
              height: window.innerHeight,
            })
          : currentRect,
      );
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [floating, floatingRect]);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoomed || floating) return;

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
        setHeight(
          Math.min(maxHeight, Math.max(MIN_TERMINAL_HEIGHT, nextHeight)),
        );
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

  // The frame animates its own insets on the docked/floating swap, so the same
  // mounted node carries the transition and the xterm inside it never detaches.
  // While the user drags, the transition is dropped so the frame tracks the
  // pointer one to one instead of easing behind it.
  const floatingTransition = floatingDragging
    ? "none"
    : `left ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, top ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, width ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, height ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}`;

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

  const controlTooltipSide = zoomed ? "bottom" : "top";

  if (!panelOpen && tabs.length === 0) return null;

  const geometryRect =
    floatingAnimating && floatingTransitionRect
      ? floatingTransitionRect
      : floatingRect;
  const floatingGeometry =
    floating && geometryRect
      ? {
          left: geometryRect.left,
          top: geometryRect.top,
          width: geometryRect.width,
          height: geometryRect.height,
          transition:
            floatingDragging || floatingAnimating ? floatingTransition : "none",
        }
      : undefined;

  return (
    <>
      {floating && (
        <div
          className="relative z-10 shrink-0 border-t"
          style={{
            height: `${height}px`,
            background: "var(--axon-editor-background)",
            borderColor: "var(--axon-panel-border)",
          }}
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <SquareTerminal
              size={18}
              className="text-[var(--axon-editor-foreground)] opacity-25"
            />
            <span className="text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
              The terminal is open in a floating window. Your shells are still
              running.
            </span>
            <button
              onClick={handleDockToggle}
              className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 py-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-75 transition-opacity hover:opacity-100"
            >
              <PanelBottom size={12} />
              Dock terminal back to the bottom
            </button>
            {floatingNotice}
          </div>
        </div>
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
        {floating && (
          <div
            onPointerDown={handleFloatingResizeStart}
            className="absolute -right-0.5 -top-0.5 z-30 h-3 w-3 cursor-nwse-resize"
            aria-hidden="true"
          />
        )}
        <div
          className={`relative z-20 flex h-9 shrink-0 items-center justify-between border-b pl-3 pr-3 ${
            floating ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerDown={floating ? handleDragStart : undefined}
          onPointerMove={floating ? handleDragMove : undefined}
          onPointerUp={floating ? handleDragEnd : undefined}
          onPointerCancel={floating ? handleDragEnd : undefined}
          style={
            {
              borderColor: "var(--axon-panel-border)",
              WebkitAppRegion: "no-drag",
              // The frame's class ternary gives floating precedence over
              // zoomed, so mirror it here: a floating header drags from its own
              // geometry and must not pick up the titlebar inset. Zero insets
              // fall through to the pl-3/pr-3 classes, which is what keeps the
              // docked header unchanged when the sidebar still owns the
              // traffic-light corner.
              ...(zoomed && !floating
                ? {
                    paddingLeft: nativeControlInset.start || undefined,
                    paddingRight: nativeControlInset.end || undefined,
                  }
                : null),
            } as CSSProperties
          }
        >
          <div className="flex min-w-0 flex-1 items-stretch gap-3 overflow-hidden">
            <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#647086]">
              <SquareTerminal size={13} />
              <span>{contribution.viewTitle}</span>
              <span className="max-w-[180px] truncate normal-case tracking-normal text-[10px] opacity-70">
                {terminalTitle}
              </span>
            </div>
            <TerminalTabBar
              tabs={tabs}
              activeTabId={activeTabId}
              active={activePanelTab === "terminal"}
              onSelect={(id) => {
                setActiveTabId(id);
                onActivePanelTabChange("terminal");
              }}
              onClose={closeTab}
              onReorder={reorderTabs}
            />
            <Tooltip
              label="New terminal tab (plus)"
              side={controlTooltipSide}
              triggerClassName="inline-flex shrink-0"
            >
              <button
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  onActivePanelTabChange("terminal");
                  createTab();
                }}
                aria-label="New terminal tab"
                className={terminalControlClassName}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            {activePanelTab === "output" && (
              <Tooltip label="Clear output" side={controlTooltipSide}>
                <button
                  onClick={onClearOutput}
                  aria-label="Clear output"
                  className={terminalControlClassName}
                >
                  <Trash2 size={13} />
                </button>
              </Tooltip>
            )}
            <Tooltip
              label={
                zoomed ? "Restore terminal (panel)" : "Zoom terminal (panel)"
              }
              side={controlTooltipSide}
            >
              <button
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleZoomToggle}
                aria-label={zoomed ? "Restore terminal" : "Zoom terminal"}
                className={terminalControlClassName}
              >
                {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </Tooltip>
            <Tooltip
              label={
                floating
                  ? "Dock terminal back to the bottom"
                  : "Show terminal as a floating window"
              }
              side={controlTooltipSide}
            >
              <button
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleFloatingToggle}
                aria-label={
                  floating
                    ? "Dock terminal back to the bottom"
                    : "Show terminal as a floating window"
                }
                className={terminalControlClassName}
              >
                {floating ? (
                  <PanelBottom size={13} />
                ) : (
                  <MoveDiagonal2 size={13} />
                )}
              </button>
            </Tooltip>
            <Tooltip label="Hide terminal (Cmd+J)" side={controlTooltipSide}>
              <button
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleHide}
                aria-label="Hide terminal"
                className={terminalControlClassName}
              >
                <Minus size={13} />
              </button>
            </Tooltip>
          </div>
        </div>

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
