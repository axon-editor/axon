import { app, BrowserWindow, protocol } from "electron";
import fs from "fs";
import path from "path";
import {
  readBootAppearance,
  type BootAppearance,
} from "./settings/bootAppearance";

let bootSplashWindow: BrowserWindow | null = null;
const pendingNativeOpenPaths: string[] = [];

type AxonBootGlobals = typeof globalThis & {
  closeAxonBootSplash?: () => void;
  queueAxonNativeOpenPath?: (filePath: string) => void;
  takeAxonBootWindow?: () => BrowserWindow | null;
  takePendingAxonNativeOpenPaths?: () => string[];
};

// macOS can send open-file before app.whenReady resolves. appMain is loaded
// after the splash becomes visible, so registering this listener there leaves a
// real interval where `axon .` is accepted by Launch Services and then lost.
// The entrypoint captures paths immediately and hands them to appMain once its
// window coordinator exists.
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const queueOpenPath = (globalThis as AxonBootGlobals).queueAxonNativeOpenPath;
  if (queueOpenPath) {
    queueOpenPath(filePath);
    return;
  }
  pendingNativeOpenPaths.push(filePath);
});

// `axon://` has to be declared before Electron reaches the ready state. The
// rest of the main process now loads after the boot splash exists, so this
// early protocol declaration stays in the tiny entrypoint instead of appMain.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "axon",
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function bootSplashImageDataUrl() {
  const candidates = [
    path.join(__dirname, "../renderer/axon.png"),
    path.join(app.getAppPath(), "dist", "renderer", "axon.png"),
    path.join(app.getAppPath(), "public", "axon.png"),
    path.join(app.getAppPath(), "build", "axon.png"),
  ];
  const imagePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!imagePath) return "";

  try {
    const image = fs.readFileSync(imagePath);
    return `data:image/png;base64,${image.toString("base64")}`;
  } catch (err) {
    console.error("failed to read Axon boot splash image:", err);
    return "";
  }
}

function bootSplashHtml(imageUrl: string, appearance: BootAppearance) {
  const imageMarkup = imageUrl
    ? `<img class="axon-splash__mark" src="${imageUrl}" alt="" />`
    : `<div class="axon-splash__fallback-mark">A</div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        --boot-background: ${appearance.background};
        --boot-foreground: ${appearance.foreground};
        --boot-accent: ${appearance.accent};
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--boot-background);
      }

      body {
        display: grid;
        place-items: center;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--boot-background) 94%, var(--boot-foreground) 6%),
          var(--boot-background)
        );
        color: var(--boot-foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .axon-splash {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
      }

      .axon-splash__mark-wrap {
        position: relative;
        display: grid;
        place-items: center;
        width: 156px;
        height: 172px;
      }

      .axon-splash__aura {
        position: absolute;
        width: 138px;
        height: 138px;
        border: 1px solid color-mix(in srgb, var(--boot-accent) 18%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--boot-accent) 3%, transparent);
        opacity: 0.72;
        transform: scale(1);
      }

      .axon-splash__mark {
        position: relative;
        z-index: 2;
        width: 112px;
        height: 112px;
        object-fit: contain;
        filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.36));
        animation: axonMarkPulse 1200ms ease-in-out infinite alternate;
      }

      .axon-splash__fallback-mark {
        position: relative;
        z-index: 2;
        display: grid;
        place-items: center;
        width: 112px;
        height: 112px;
        border: 1px solid color-mix(in srgb, var(--boot-accent) 28%, transparent);
        border-radius: 30px;
        background: color-mix(in srgb, var(--boot-accent) 7%, transparent);
        color: var(--boot-foreground);
        font-size: 56px;
        font-weight: 700;
        animation: axonMarkPulse 1200ms ease-in-out infinite alternate;
      }

      .axon-splash__title {
        display: flex;
        min-height: 30px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0;
        color: var(--boot-foreground);
      }

      .axon-splash__wordline {
        width: 88px;
        height: 1px;
        margin-top: 7px;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent, var(--boot-accent), transparent);
      }

      @keyframes axonMarkPulse {
        from { transform: scale(0.985); opacity: 0.92; }
        to { transform: scale(1.02); opacity: 1; }
      }
    </style>
  </head>
  <body>
    <div class="axon-splash" role="status" aria-label="Opening Axon">
      <div class="axon-splash__mark-wrap">
        <div class="axon-splash__aura"></div>
        ${imageMarkup}
      </div>
      <div>
        <div class="axon-splash__title"><span>A</span><span>X</span><span>O</span><span>N</span></div>
        <div class="axon-splash__wordline"></div>
      </div>
    </div>
  </body>
</html>`;
}

async function createBootSplashWindow() {
  const appearance = readBootAppearance();
  // This is the real editor window during its boot phase, not a second splash
  // window. The important detail is that the window is not shown until the
  // tiny splash document has loaded. If the BrowserWindow is shown first,
  // Chromium paints the empty native background for a moment, then React shows
  // what looks like a fake loader later. Loading the boot document first makes
  // the splash the first visible frame of the app.
  bootSplashWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    movable: true,
    show: false,
    frame: false,
    title: "Axon",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 14, y: 13 } : undefined,
    backgroundColor: appearance.background,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // This BrowserWindow becomes the real editor window after the splash, so
      // its renderer scheduling policy must match createWindow's normal path.
      // Without this setting the production-only reused window still throttles
      // terminal output whenever Axon loses focus.
      backgroundThrottling: false,
    },
  });

  const splashWindow = bootSplashWindow;
  bootSplashWindow.on("closed", () => {
    bootSplashWindow = null;
  });

  try {
    await splashWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        bootSplashHtml(bootSplashImageDataUrl(), appearance),
      )}`,
    );
  } catch (err) {
    console.error("failed to load Axon boot splash:", err);
  }

  if (!splashWindow.isDestroyed()) {
    splashWindow.show();
  }
}

function closeBootSplashWindow() {
  const splashWindow = bootSplashWindow;
  if (!splashWindow || splashWindow.isDestroyed()) return;
  bootSplashWindow = null;
  splashWindow.close();
}

(globalThis as AxonBootGlobals).closeAxonBootSplash = closeBootSplashWindow;

(globalThis as AxonBootGlobals).takeAxonBootWindow = () => {
  const splashWindow = bootSplashWindow;
  bootSplashWindow = null;
  return splashWindow && !splashWindow.isDestroyed() ? splashWindow : null;
};

(globalThis as AxonBootGlobals).takePendingAxonNativeOpenPaths = () =>
  pendingNativeOpenPaths.splice(0);

app.whenReady().then(async () => {
  await createBootSplashWindow();

  // Load the real main process only after the boot splash exists. `require`
  // stays inside this callback on purpose: a static import would put the heavy
  // module graph back on the critical path and recreate the blank window delay.
  require("./appMain");
});
