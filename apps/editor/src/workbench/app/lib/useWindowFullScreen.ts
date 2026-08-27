import { useEffect, useState } from "react";

// useWindowFullScreen mirrors Electron's native BrowserWindow state into the
// React tree. Native macOS fullscreen does not trigger document.fullscreenElement,
// so relying on browser APIs would leave Axon's traffic-light padding stale.
export function useWindowFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    let mounted = true;
    let receivedNativeUpdate = false;

    // Subscribe before requesting the initial value. Fullscreen transitions
    // are animated on macOS, and an event can arrive while the IPC request is
    // still resolving. Once an event has supplied newer state, the older query
    // result must not overwrite it and move the title-bar content backwards.
    const unsubscribe = window.axon.onWindowFullScreenChanged((nextState) => {
      if (!mounted) return;
      receivedNativeUpdate = true;
      setIsFullScreen(nextState);
    });

    void window.axon
      .isWindowFullScreen()
      .then((initialState) => {
        if (mounted && !receivedNativeUpdate) {
          setIsFullScreen(initialState);
        }
      })
      .catch(() => {
        // Keeping the normal-window inset is the safe fallback if the window
        // closes during startup and its IPC request can no longer resolve.
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return isFullScreen;
}
