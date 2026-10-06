/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Docked placeholder shown while the terminal is floating. The slot keeps the
// panel's old height so the editor does not jump when float opens or docks
// back, and the dock button gives a one click route home from the notice.
import type { ReactNode } from "react";
import { PanelBottom, SquareTerminal } from "lucide-react";

interface Props {
  height: number;
  onDock: () => void;
  children?: ReactNode;
}

export default function FloatingDockNotice({ height, onDock, children }: Props) {
  return (
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
          onClick={onDock}
          className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 py-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-75 transition-opacity hover:opacity-100"
        >
          <PanelBottom size={12} />
          Dock terminal back to the bottom
        </button>
        {children}
      </div>
    </div>
  );
}
