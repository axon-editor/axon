/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Zooming parks the panel header in the window's top strip, where workbench
// chrome or the native window can swallow pointer events, and the user can end
// up locked behind controls they cannot click. This is the keyboard way out, so
// the failure mode above stays recoverable even when the pointer cannot. Escape
// is ignored inside xterm on purpose: a running TUI (vim, fzf, a pager) owns the
// key there, and stealing it would break those sessions.
import { useEffect } from "react";

const TERMINAL_SURFACE_SELECTOR = ".xterm, .xterm-screen, .terminal-host";

export function useZoomedPanelEscape(
  zoomed: boolean,
  setZoomed: (value: boolean) => void,
): void {
  useEffect(() => {
    if (!zoomed) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(TERMINAL_SURFACE_SELECTOR)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setZoomed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setZoomed, zoomed]);
}
