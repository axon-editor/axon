/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Collapsed strip shown in the editor while the terminal lives in the
// dedicated window. Floating is about reclaiming editor space, so the panel
// shrinks to a thin bar with one action: dock the window back. The xterm
// instances underneath stay mounted (the panel body is display:none, not
// unmounted), which is why resume only has to replay the delta that was
// produced while floating.
import type { ReactNode } from "react";
import { PanelBottom, SquareTerminal } from "lucide-react";

interface Props {
  onDock: () => void;
  children?: ReactNode;
}

const FLOATING_NOTICE_BAR_HEIGHT = 32;

export default function FloatingDockNotice({ onDock, children }: Props) {
  return (
    <div
      className="relative z-10 shrink-0"
      style={{
        height: `${FLOATING_NOTICE_BAR_HEIGHT}px`,
        background: "var(--axon-editor-background)",
        borderColor: "var(--axon-panel-border)",
      }}
    >
      <div className="flex h-full items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
          <SquareTerminal size={14} className="shrink-0 opacity-25" />
          <span className="truncate">
            The terminal is open in a floating window. Your shells are still
            running.
          </span>
        </div>
        <button
          onClick={onDock}
          title="Dock the terminal window back to the bottom panel"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 py-0.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-75 transition-opacity hover:opacity-100"
        >
          <PanelBottom size={12} />
          Dock terminal
        </button>
        {children}
      </div>
    </div>
  );
}