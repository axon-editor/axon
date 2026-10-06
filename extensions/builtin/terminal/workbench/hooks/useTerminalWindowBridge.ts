/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Editor-side bridge for the dedicated terminal window. The editor parks its
// live sessions (close websocket, suppress reconnect), hands the snapshot to
// main, and treats the floating flag from the session manager as "window is
// open". Every value is read from the render closure so handlers and effects
// always see the latest floating/open state instead of a stale registration.

import { useCallback, useEffect } from "react";
import { type TerminalSurfaceDockMode } from "@axon-editor/shared/terminalWindow";
import { type TerminalWindowHandoff } from "@axon-editor/shared/terminalWindow";

interface UseTerminalWindowBridgeOptions {
  // False for the windowed surface itself, which routes its dock/hide through
  // onWindowDock/onWindowHide instead of these IPC calls. The editor surface
  // owns the window lifecycle while the window owns the session exchange.
  enabled: boolean;
  open: boolean;
  floating: boolean;
  setFloating: (floating: boolean) => void;
  onHide: () => void;
  parkSessions: () => void;
  resumeSessions: (handoff: TerminalWindowHandoff | null) => void;
  serializeSnapshot: () => TerminalWindowHandoff | null;
}

export function useTerminalWindowBridge({
  enabled,
  open,
  floating,
  setFloating,
  onHide,
  parkSessions,
  resumeSessions,
  serializeSnapshot,
}: UseTerminalWindowBridgeOptions) {
  const openWindow = useCallback(() => {
    if (!enabled) return;
    const snapshot = serializeSnapshot();
    if (!snapshot) return;

    // The park is the handoff lock: the editor closes its websockets before
    // the window opens, so the PTY host never sees two owners for one session
    // id. A failed window create must restore the sessions so the shells keep
    // running instead of staying parked against a window that never opened.
    void window.axon.openTerminalWindow(snapshot).catch((error) => {
      console.error("failed to open the floating terminal window:", error);
      setFloating(false);
      resumeSessions(null);
    });
    parkSessions();
    setFloating(true);
  }, [enabled, parkSessions, resumeSessions, serializeSnapshot, setFloating]);

  const dockWindow = useCallback(
    (dockMode: TerminalSurfaceDockMode) => {
      if (!enabled) return;
      void window.axon.closeTerminalWindow(dockMode).catch((error) => {
        console.error("failed to dock the floating terminal window:", error);
      });
    },
    [enabled],
  );

  const handleFloatingToggle = useCallback(() => {
    if (floating) dockWindow("show");
    else openWindow();
  }, [dockWindow, floating, openWindow]);

  const dockTerminalWindow = useCallback(
    () => dockWindow("show"),
    [dockWindow],
  );
  const hideTerminalWindow = useCallback(
    () => dockWindow("hide"),
    [dockWindow],
  );

  useEffect(() => {
    if (!enabled) return;
    const subscribeDocked = window.axon.onTerminalDocked;
    if (!subscribeDocked) return;
    // Main reports the handoff the window handed over, or null when there was
    // no window to hand over from. The editor adopts tabs that were born in
    // the window and resumes sessions that traveled with it; a null handoff
    // means its own tabs were the ones that stayed, so resume without adopt.
    return subscribeDocked((handoff) => {
      setFloating(false);
      resumeSessions(handoff);
      if (handoff?.dockMode === "hide") onHide();
    });
  }, [enabled, onHide, resumeSessions, setFloating]);

  useEffect(() => {
    if (!enabled) return;
    // Cmd+J is a visibility toggle, so hiding the panel while the window owns
    // the terminal must satisfy the window close request instead of leaving a
    // floating window with no panel to dock back into. The effect deps carry
    // the current floating value, which is exactly the state a stale closure
    // would miss when the panel hide and the float happened together.
    if (open || !floating) return;
    dockWindow("hide");
  }, [dockWindow, enabled, floating, open]);

  return {
    toggleTerminalWindow: handleFloatingToggle,
    dockTerminalWindow,
    hideTerminalWindow,
  };
}