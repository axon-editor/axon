import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { type AxonCommand } from "../../shared/commands";
import { buildApplicationMenu } from "./menu";

interface WindowDependencies {
  axonDevServerUrl: string;
  isDev: boolean;
  isMac: boolean;
  isWindows: boolean;
  getAxonIconPath: () => string;
  shouldBlockBrowserShortcut: (input: {
    key: string;
    control: boolean;
    meta: boolean;
    alt: boolean;
    shift: boolean;
  }) => boolean;
  sendMenuCommand: (command: AxonCommand) => void;
  createNewWindow: () => void;
}

interface CreateWindowOptions {
  existingWindow?: BrowserWindow | null;
  restoreSession?: boolean;
}

function isExternalHandlerUrl(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href);
}

function routeExternalNavigation(window: BrowserWindow) {
  // Markdown and HTML previews can contain normal anchors, raw HTML anchors,
  // or target=_blank links. React handles the common Markdown path, but the
  // main process still has to be the final guard because Chromium can create a
  // new Electron BrowserWindow before renderer code sees the click. Denying
  // those navigations keeps Axon as a single editor window while still sending
  // web, mail, and phone links to the user's configured system app.
  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isExternalHandlerUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl || targetUrl === window.webContents.getURL()) return;
    event.preventDefault();
    if (isExternalHandlerUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
  });
}

export function createWindow(deps: WindowDependencies, options: CreateWindowOptions = {}) {
  const axonIconPath = deps.getAxonIconPath();
  const restoreSession = options.restoreSession !== false;

  app.setAboutPanelOptions({
    applicationName: "Axon",
    applicationVersion: app.getVersion(),
    copyright: "Axon",
    iconPath: axonIconPath,
  });

  if (deps.isMac && app.dock) {
    app.dock.setIcon(axonIconPath);
  }

  const window =
    options.existingWindow && !options.existingWindow.isDestroyed()
      ? options.existingWindow
      : new BrowserWindow({
          width: 1280,
          height: 800,
          minWidth: 800,
          minHeight: 600,
          title: "Axon",
          // macOS can provide the first draggable titlebar region before React
          // has mounted. That matters during cold start: if the renderer owns
          // all drag regions, the window feels inert while Vite/React are still
          // booting. The native hidden-inset titlebar keeps Axon movable
          // immediately, while the renderer can focus only on editor chrome
          // once it is ready.
          titleBarStyle: deps.isMac ? "hiddenInset" : "hidden",
          trafficLightPosition: deps.isMac ? { x: 14, y: 13 } : undefined,
          titleBarOverlay: deps.isWindows
            ? {
                color: "#0f1117",
                symbolColor: "#9aa4b8",
                height: 36,
              }
            : undefined,
          // I keep the native window opaque by default because macOS Mission
          // Control has to live-composite every visible window while it animates
          // the desktop. A transparent Electron window with vibrancy forces
          // WindowServer and the GPU process to blend Axon's full editor surface
          // even when the renderer is mostly painting opaque panels. That is
          // exactly the path that makes the three-finger "show all apps"
          // gesture feel slow on some Macs.
          //
          // The renderer still owns Axon's theme colors, but the native surface
          // should stay cheap unless we deliberately build a separate
          // performance-gated transparency mode later.
          transparent: false,
          backgroundMaterial: deps.isWindows ? "mica" : undefined,
          backgroundColor: "#0f1117",
          icon: axonIconPath,
          webPreferences: {
            preload: path.join(__dirname, "../../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // Agent and task output must continue to drain and paint when Axon
            // is behind another window. Chromium otherwise throttles the timers
            // and animation frames that xterm uses, making background output
            // appear frozen until the editor regains focus.
            backgroundThrottling: false,
          },
        });

  window.setTitle("Axon");

  window.webContents.on("before-input-event", (event, input) => {
    if (!deps.shouldBlockBrowserShortcut(input)) return;
    event.preventDefault();
  });
  routeExternalNavigation(window);

  if (deps.isDev) {
    window.loadURL(deps.axonDevServerUrl);
  } else {
    window.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  return {
    window,
    menu: buildApplicationMenu(
      deps.sendMenuCommand,
      deps.isMac,
      deps.createNewWindow,
    ),
    restoreSession,
  };
}
