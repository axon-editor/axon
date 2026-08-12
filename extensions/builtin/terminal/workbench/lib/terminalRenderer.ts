import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";
import type { TerminalGpuAcceleration } from "@axon-editor/shared/settings";
import type { TerminalRendererController } from "@axon-editor/platform/terminal/terminalProtocol";

let webgl2Available: boolean | null = null;

function supportsWebgl2() {
  if (webgl2Available !== null) return webgl2Available;

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    webgl2Available = context !== null;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Available = false;
  }

  return webgl2Available;
}

export function createTerminalRendererController(
  terminal: Terminal,
): TerminalRendererController {
  let contextLossDisposable: { dispose: () => void } | null = null;
  let webglAddon: WebglAddon | null = null;
  let webglUnavailable = false;
  let disposed = false;

  const deactivateWebgl = () => {
    contextLossDisposable?.dispose();
    contextLossDisposable = null;
    const activeAddon = webglAddon;
    webglAddon = null;
    activeAddon?.dispose();
  };

  const fallBackToDom = (reason: "context-loss" | "initialization") => {
    webglUnavailable = true;
    deactivateWebgl();
    if (disposed) return;

    window.requestAnimationFrame(() => {
      if (!disposed) terminal.refresh(0, Math.max(0, terminal.rows - 1));
    });
    console.warn(
      reason === "context-loss"
        ? "terminal WebGL context was lost; using the DOM renderer for this session"
        : "terminal WebGL renderer was unavailable; using the DOM renderer for this session",
    );
  };

  const activateWebgl = (mode: TerminalGpuAcceleration) => {
    if (disposed || webglAddon || webglUnavailable) return;
    if (mode === "auto" && !supportsWebgl2()) return;

    // Electron can recycle the compositor mailbox backing a WebGL canvas while
    // terminal rows are outside the viewport. xterm still owns the correct text
    // and ANSI color attributes, but the recycled surface can come back blank
    // until a resize forces a complete redraw. Preserving the drawing buffer
    // keeps the visible terminal canvas valid across those compositor passes.
    // This is scoped to each visible terminal canvas, not the 200,000-line
    // scrollback buffer, so it does not duplicate the terminal's full history.
    const nextAddon = new WebglAddon(true);
    const lossDisposable = nextAddon.onContextLoss(() => {
      if (webglAddon !== nextAddon) return;
      fallBackToDom("context-loss");
    });

    try {
      terminal.loadAddon(nextAddon);
      webglAddon = nextAddon;
      contextLossDisposable = lossDisposable;
    } catch (error) {
      lossDisposable.dispose();
      nextAddon.dispose();
      fallBackToDom("initialization");
      console.error("failed to activate terminal WebGL renderer:", error);
    }
  };

  return {
    sync(visible, mode) {
      if (!visible || mode === "off") {
        deactivateWebgl();
        return;
      }
      activateWebgl(mode);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      deactivateWebgl();
    },
  };
}
