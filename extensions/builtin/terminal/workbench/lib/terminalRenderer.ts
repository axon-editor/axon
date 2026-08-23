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

  const activateWebgl = (mode: TerminalGpuAcceleration) => {
    if (disposed || webglAddon || webglUnavailable) return;
    if (mode === "auto" && !supportsWebgl2()) return;

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
      if (!visible || mode === "off") {
        deactivateWebgl();
        return;
      }
      activateWebgl(mode);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      deactivateWebgl(false);
    },
  };
}
