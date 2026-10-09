/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure presentation for the panel header: identity, tab strip, and the window
// controls. Every action arrives as a callback, so the session state behind
// the panel stays in Terminal instead of drifting into the chrome. Extracted
// from Terminal, which had the header markup fused into the frame's geometry
// concerns.
import type { CSSProperties } from "react";
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
import { type BottomPanelTab } from "@axon-editor/platform/panel/bottomPanel";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import TerminalTabBar, { type TerminalTabItem } from "./TerminalTabBar";
import { type TerminalWorkbenchContribution } from "../lib/contribution";

const terminalControlClassName =
  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-500 transition-colors hover:bg-[#151923] hover:text-white";

interface Props {
  activePanelTab: "terminal" | BottomPanelTab;
  contribution: TerminalWorkbenchContribution;
  terminalTitle: string;
  // True while the dedicated terminal window owns the sessions. The float
  // button flips to its dock state and the traffic-light clearance applies
  // unconditionally, mirroring the zoomed header for a window that is already
  // parked under the OS titlebar.
  floating: boolean;
  zoomed: boolean;
  // True when the terminal fills a dedicated window. The header becomes the
  // native drag region, the zoom control is replaced by dock/hide, and the
  // traffic-light/caption clearance applies unconditionally instead of only in
  // the zoomed state.
  windowed?: boolean;
  nativeControlInset: {
    start: number;
    end: number;
  };
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabReorder: (orderedIds: string[]) => void;
  onNewTab: () => void;
  onClearOutput: () => void;
  onZoomToggle: () => void;
  onFloatingToggle: () => void;
  onHide: () => void;
}

export default function TerminalHeader({
  activePanelTab,
  contribution,
  terminalTitle,
  floating,
  zoomed,
  windowed = false,
  nativeControlInset,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onNewTab,
  onClearOutput,
  onZoomToggle,
  onFloatingToggle,
  onHide,
}: Props) {
  const isWindowed = windowed === true;
  // Tooltips flip below the header while zoomed because the top of the screen
  // is where the panel sits in that state and an upward tooltip would clip
  // off the window.
  const controlTooltipSide = zoomed ? "bottom" : "top";
  // Preserve the native drag surface around the whole windowed header: empty
  // areas (and the traffic-light inset) move the window, while the tab strip
  // and the control buttons opt back out of the drag region.
  const noDragStyle = isWindowed
    ? ({ WebkitAppRegion: "no-drag" } as CSSProperties)
    : undefined;
  // The header parks under the window's top strip whenever the panel is
  // zoomed, or always while the surface is itself a window. A docked header
  // never needs the inset because the workbench titlebar owns the traffic
  // lights there. Zero insets fall through to the pl-3/pr-3 classes, which is
  // what keeps the docked header unchanged when the sidebar still owns the
  // corner.
  const useNativeControlInset = isWindowed || zoomed;

  return (
    <div
      className={`relative z-20 flex h-9 shrink-0 items-center justify-between border-b pl-3 pr-3`}
      style={
        {
          borderColor: "var(--axon-panel-border)",
          WebkitAppRegion: isWindowed ? "drag" : "no-drag",
          ...(useNativeControlInset
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
          onSelect={onTabSelect}
          onClose={onTabClose}
          onReorder={onTabReorder}
          windowed={isWindowed}
        />
        <Tooltip
          label="New terminal tab (plus)"
          side={controlTooltipSide}
          triggerClassName="inline-flex shrink-0"
        >
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onNewTab}
            aria-label="New terminal tab"
            className={terminalControlClassName}
            style={noDragStyle}
          >
            <Plus size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1" style={noDragStyle}>
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
        {!isWindowed && (
          <Tooltip
            label={zoomed ? "Restore terminal (panel)" : "Zoom terminal (panel)"}
            side={controlTooltipSide}
          >
            <button
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onZoomToggle}
              aria-label={zoomed ? "Restore terminal" : "Zoom terminal"}
              className={terminalControlClassName}
            >
              {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </Tooltip>
        )}
        <Tooltip
          label={
            floating || isWindowed
              ? "Dock terminal back to the editor"
              : "Show terminal as a floating window"
          }
          side={controlTooltipSide}
        >
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onFloatingToggle}
            aria-label={
              floating || isWindowed
                ? "Dock terminal back to the editor"
                : "Show terminal as a floating window"
            }
            className={terminalControlClassName}
          >
            {floating || isWindowed ? (
              <PanelBottom size={13} />
            ) : (
              <MoveDiagonal2 size={13} />
            )}
          </button>
        </Tooltip>
        <Tooltip
          label={isWindowed ? "Hide terminal" : "Hide terminal (Cmd+J)"}
          side={controlTooltipSide}
        >
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onHide}
            aria-label="Hide terminal"
            className={terminalControlClassName}
          >
            <Minus size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}