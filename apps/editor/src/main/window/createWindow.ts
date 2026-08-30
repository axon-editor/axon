import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { type AxonCommand } from "../../shared/commands";
import { readBootAppearance } from "../settings/bootAppearance";
import { buildApplicationMenu } from "./menu";
import {
  applyWindowGlass,
  getWindowGlassBackground,
  getWindowGlassConstructorOptions,
  synchronizeNativeGlassAppearance,
} from "./windowGlass";

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

function notifyRendererOfFullScreen(window: BrowserWindow) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  window.webContents.send("window:fullScreenChanged", window.isFullScreen());
}

export function getEditorWebPreferences(preload: string) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // Terminal agents, task output, and extension events must keep draining
    // while another app or Axon window is focused. Chromium's background timer
    // throttling otherwise creates a different execution model for the reused
    // boot window and every later BrowserWindow, then delivers a large burst
    // only when the user returns.
    backgroundThrottling: false,
  };
}

export function createWindow(
  deps: WindowDependencies,
  options: CreateWindowOptions = {},
) {
  const axonIconPath = deps.getAxonIconPath();
  const bootAppearance = readBootAppearance();
  synchronizeNativeGlassAppearance(
    bootAppearance.glassMode,
    bootAppearance.appearance,
  );
  const restoreSession = options.restoreSession !== false;

  app.setAboutPanelOptions({
    applicationName: "Axon",
    applicationVersion: app.getVersion(),
    copyright: "Axon",
    iconPath: axonIconPath,
  });

  if (deps.isMac && deps.isDev && app.dock) {
    // Packaged macOS builds already expose the generated icon.icns through the
    // app bundle. Replacing it after launch causes the Dock to visibly switch
    // icons, so only development needs an explicit runtime override.
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
                color: bootAppearance.background,
                symbolColor: "#9aa4b8",
                height: 36,
              }
            : undefined,
          ...getWindowGlassConstructorOptions(bootAppearance.glassMode),
          // Axon keeps a normal opaque BrowserWindow even when glass is active.
          // The OS material sits behind Chromium and the renderer reveals it
          // through alpha-tinted surfaces, avoiding Electron's layered
          // transparent-window mode and its resize and Mission Control costs.
          transparent: false,
          backgroundColor: getWindowGlassBackground(
            bootAppearance.glassMode,
            bootAppearance.background,
          ),
          icon: axonIconPath,
          webPreferences: getEditorWebPreferences(
            path.join(__dirname, "../../preload/index.js"),
          ),
        });

  applyWindowGlass(
    window,
    bootAppearance.glassMode,
    bootAppearance.background,
    bootAppearance.appearance,
  );

  window.setTitle("Axon");

  // macOS removes its traffic lights in native fullscreen, but hidden-inset
  // title bars do not expose that change through CSS. Forward Electron's
  // native lifecycle events so the renderer can reclaim the reserved left
  // inset immediately, then restore it when the controls return. Registering
  // this per BrowserWindow also keeps independent windows from sharing state.
  window.on("enter-full-screen", () => notifyRendererOfFullScreen(window));
  window.on("leave-full-screen", () => notifyRendererOfFullScreen(window));

  window.webContents.on("before-input-event", (event, input) => {
    if (!deps.shouldBlockBrowserShortcut(input)) return;
    event.preventDefault();
  });
  routeExternalNavigation(window);

  const bootAppearanceQuery = {
    axonBootAppearance: bootAppearance.appearance,
    axonBootBackground: bootAppearance.background,
    axonBootForeground: bootAppearance.foreground,
    axonBootAccent: bootAppearance.accent,
  };

  if (deps.isDev) {
    const rendererUrl = new URL(deps.axonDevServerUrl);
    Object.entries(bootAppearanceQuery).forEach(([key, value]) => {
      rendererUrl.searchParams.set(key, value);
    });
    window.loadURL(rendererUrl.toString());
  } else {
    window.loadFile(path.join(__dirname, "../../renderer/index.html"), {
      query: bootAppearanceQuery,
    });
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
