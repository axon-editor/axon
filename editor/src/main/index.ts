import { app, BrowserWindow, protocol } from "electron";
import fs from "fs";
import path from "path";
import url from "url";

let bootSplashWindow: BrowserWindow | null = null;

// `axon://` has to be declared before Electron reaches the ready state. The
// rest of the main process now loads after the boot splash exists, so this
// early protocol declaration stays in the tiny entrypoint instead of appMain.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "axon",
    privileges: { secure: true, standard: true, stream: true },
  },
]);

function bootSplashImageUrl() {
  const candidates = [
    path.join(__dirname, "../renderer/axon.png"),
    path.join(app.getAppPath(), "dist", "renderer", "axon.png"),
    path.join(app.getAppPath(), "public", "axon.png"),
    path.join(app.getAppPath(), "build", "axon.png"),
  ];
  const imagePath = candidates.find((candidate) => fs.existsSync(candidate));
  return imagePath ? url.pathToFileURL(imagePath).toString() : "";
}

function bootSplashHtml(imageUrl: string) {
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
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #080a10;
      }

      body {
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 50% 42%, rgba(128, 200, 224, 0.025), transparent 28%),
          linear-gradient(180deg, #10131b 0%, #080a10 100%);
        color: #e6ebf5;
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
        border: 1px solid rgba(128, 200, 224, 0.12);
        border-radius: 999px;
        background: rgba(128, 200, 224, 0.01);
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
        border: 1px solid rgba(128, 200, 224, 0.24);
        border-radius: 30px;
        background: rgba(128, 200, 224, 0.055);
        color: #f5f8ff;
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
        color: #f5f8ff;
      }

      .axon-splash__wordline {
        width: 88px;
        height: 1px;
        margin-top: 7px;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent, rgba(128, 200, 224, 0.68), transparent);
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

function createBootSplashWindow() {
  // This window exists before Axon's full main process is imported. The normal
  // renderer splash can only appear after BrowserWindow creation and HTML load,
  // but the expensive main-process module graph was previously evaluated before
  // either of those things happened. Keeping this boot file tiny lets the user
  // see Axon immediately while the real editor services register in appMain.
  bootSplashWindow = new BrowserWindow({
    width: 420,
    height: 360,
    resizable: false,
    movable: true,
    show: true,
    frame: false,
    title: "Axon",
    backgroundColor: "#080a10",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void bootSplashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(bootSplashHtml(bootSplashImageUrl()))}`,
  );
  bootSplashWindow.on("closed", () => {
    bootSplashWindow = null;
  });
}

function closeBootSplashWindow() {
  const splashWindow = bootSplashWindow;
  if (!splashWindow || splashWindow.isDestroyed()) return;
  bootSplashWindow = null;
  splashWindow.close();
}

(globalThis as typeof globalThis & {
  closeAxonBootSplash?: () => void;
}).closeAxonBootSplash = closeBootSplashWindow;

app.whenReady().then(() => {
  createBootSplashWindow();

  // Load the real main process only after the boot splash exists. `require`
  // stays inside this callback on purpose: a static import would put the heavy
  // module graph back on the critical path and recreate the blank window delay.
  require("./appMain");
});
