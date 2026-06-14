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
    if (!isExternalHandlerUrl(targetUrl)) return;

    event.preventDefault();
    void shell.openExternal(targetUrl);
  });
}

export function createWindow(deps: WindowDependencies, options: { restoreSession?: boolean } = {}) {
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

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Axon",
    titleBarStyle: "hidden",
    titleBarOverlay: deps.isWindows
      ? {
          color: "#0f1117",
          symbolColor: "#9aa4b8",
          height: 36,
        }
      : undefined,
    backgroundColor: "#0f0f0f",
    icon: axonIconPath,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      nodeIntegration: false,
    },
  });

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
