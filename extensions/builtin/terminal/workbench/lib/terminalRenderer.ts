import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";
import type { TerminalRendererController } from "@axon-editor/platform/terminal/terminalProtocol";

export function createTerminalRendererController(
  terminal: Terminal,
  requestRefreshDimensions: () => void = () => undefined,
): TerminalRendererController {
  let contextLossDisposable: { dispose: () => void } | null = null;
  let webglAddon: WebglAddon | null = null;
  let webglUnavailable = false;
  let disposed = false;

  const deactivateWebgl = (refreshDimensions = true) => {
    contextLossDisposable?.dispose();
    contextLossDisposable = null;
    const activeAddon = webglAddon;
    webglAddon = null;
    activeAddon?.dispose();
    if (activeAddon && refreshDimensions && !disposed) {
      requestRefreshDimensions();
    }
  };

  const fallBackToDom = (reason: "context-loss" | "initialization") => {
    webglUnavailable = true;
    deactivateWebgl();
    if (disposed) return;
    console.warn(
      reason === "context-loss"
        ? "terminal WebGL context was lost; using the DOM renderer for this session"
        : "terminal WebGL renderer was unavailable; using the DOM renderer for this session",
    );
  };

  const activateWebgl = () => {
    if (disposed || webglAddon || webglUnavailable) return;

    // xterm owns both the WebGL drawing model and its frame invalidation. I keep
    // the addon on its standard context configuration so Chromium can manage
    // the drawing buffer normally; forcing a preserved buffer puts Axon on a
    // renderer path that VS Code does not use and makes stale frames harder for
    // the browser to discard.
    const nextAddon = new WebglAddon();
    const lossDisposable = nextAddon.onContextLoss(() => {
      if (webglAddon !== nextAddon) return;
      fallBackToDom("context-loss");
    });

    try {
      terminal.loadAddon(nextAddon);
      webglAddon = nextAddon;
      contextLossDisposable = lossDisposable;
      // DOM and WebGL can report different cell measurements for the same font.
      // The host must fit again after the renderer changes or its PTY dimensions
      // can describe a different grid from the canvas the user is looking at.
      requestRefreshDimensions();
    } catch (error) {
      lossDisposable.dispose();
      nextAddon.dispose();
      requestRefreshDimensions();
      fallBackToDom("initialization");
      console.error("failed to activate terminal WebGL renderer:", error);
    }
  };

  return {
    sync(visible, mode) {
      // `auto` deliberately keeps xterm's built-in DOM renderer. Axon's terminal
      // tabs remain mounted while hidden and Electron may discard an unpreserved
      // WebGL drawing surface without reporting context loss. In that state the
      // xterm buffer is correct, background rectangles may still appear, and
      // foreground glyph rows stay blank until a resize forces a full paint.
      // The DOM renderer follows the same xterm parser and buffer but keeps its
      // rendered rows in the document, so it does not depend on a retained GPU
      // surface. Users can still select `on` to opt into WebGL explicitly.
      if (mode !== "on") {
        deactivateWebgl();
        return;
      }

      // xterm already observes whether its screen intersects the viewport and
      // pauses rendering while the terminal is hidden. Keep an existing WebGL
      // addon attached across panel and tab visibility changes so the same GPU
      // context is reused when the terminal becomes visible again. Disposing
      // the addon for every hide/show cycle removes its canvas, but the current
      // addon does not immediately release the underlying WebGL2 context. Those
      // orphaned contexts accumulate until Chromium evicts a live terminal's
      // renderer, leaving its buffer intact but its output missing until a
      // resize forces a new full paint.
      if (visible) {
        activateWebgl();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      deactivateWebgl(false);
    },
  };
}
