import {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
} from "electron";
import path from "path";
import url from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { registerLspHandlers } from "./lsp/handlers";
import {
  getActiveLanguageServerSessions,
  stopAllLanguageServers,
} from "./lsp/features";
import {
  notifyLanguageServer,
  notifyLanguageServerConfiguration,
} from "./lsp/session";
import { registerAppHandlers } from "./app/handlers";
import { registerDiagnosticsHandlers } from "./diagnostics/handlers";
import { registerExtensionHandlers } from "./extensions/handlers";
import { registerFileWatcherHandlers } from "./fs/handlers";
import { FileWatcherManager } from "./fs/watcher";
import { registerGitHandlers } from "./git/handlers";
import { getGitWatchPaths } from "./git/git";
import { registerHtmlPreviewHandlers } from "./htmlPreview/handlers";
import { registerTaskHandlers } from "./tasks/handlers";
import { TaskManager } from "./tasks/tasks";
import { HtmlPreviewServer } from "./htmlPreview/server";
import { createWindow } from "./window/createWindow";
import { readSettingsForFolder, readSettingsFromDisk } from "./settings/io";
import { getAxonIconPath } from "./fonts/fonts";
import { registerSettingsHandlers } from "./settings/handlers";
import { registerUpdateHandlers } from "./updates/handlers";
import { UpdateManager } from "./updates/updater";
import { createMainProcessIpc } from "./core/ipc";
import { createBundledCoreController } from "./core/process";
import { registerSpotifyHandlers } from "./spotify/handlers";
import { setClientId } from "./spotify/api";
import { AXON_SPOTIFY_CLIENT_ID } from "./generated/buildConfig";
import {
  handleSpotifyProtocolRequest,
  handleSpotifySecondInstanceArg,
  registerSpotifyOpenUrlHandler,
  registerSpotifyProtocolClient,
} from "./spotify/protocol";

const isDev = process.env.NODE_ENV === "development";
const axonDevServerUrl =
  process.env.AXON_DEV_SERVER_URL ?? "http://localhost:5173";
const hasDevSingleInstanceLock = !isDev || app.requestSingleInstanceLock();
app.setName("Axon");
const execFileAsync = promisify(execFile);

const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const shouldPollWatchers = process.platform === "darwin";
function resolveMacAppBundlePath() {
  if (!isMac) return null;

  const appPathParts = process.execPath.split(`${path.sep}Contents${path.sep}`);
  if (appPathParts.length < 2 || !appPathParts[0].endsWith(".app")) {
    return null;
  }

  return appPathParts[0];
}
function isExternalHandlerUrl(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href);
}
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
const windowSessionRestore = new Map<number, boolean>();
const axonCorePort = process.env.AXON_CORE_PORT ?? "7777";
const axonReleaseApiUrl =
  "https://api.github.com/repos/GordenArcher/axon/releases/latest";
const axonReleasePageUrl =
  "https://github.com/GordenArcher/axon/releases/latest";
let htmlPreviewServer: HtmlPreviewServer | null = null;
const { sendToRenderer, sendMenuCommand } = createMainProcessIpc({
  getMainWindow: () => mainWindow,
});
const bundledCore = createBundledCoreController({
  isDev,
  axonCorePort,
});
const taskManager = new TaskManager({
  sendToRenderer,
});
const fileWatcherManager = new FileWatcherManager({
  shouldPollWatchers,
  shouldIgnoreWorkspaceWatchPath: (candidatePath: string) => {
    const normalizedPath = candidatePath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    // Hidden project files are valid editor content. I only ignore folders/files
    // that are implementation noise or generated output, because ignoring every
    // dot-prefixed path makes newly created files such as .gitignore and release
    // workflow files invisible until the core tree filter is changed too.
    return segments.some((segment, index) => {
      if (segment === ".git" || segment === ".DS_Store") return true;
      if (
        segment === "node_modules" ||
        segment === "vendor" ||
        segment === "dist" ||
        segment === "release"
      ) {
        return true;
      }

      return (
        segment === "build" &&
        index < segments.length - 1 &&
        segments[index + 1] === "core"
      );
    });
  },
  sendToRenderer,
  getGitWatchPaths,
  stopAllLanguageServers,
});
const updateManager = new UpdateManager({
  sendToRenderer,
  releaseApiUrl: axonReleaseApiUrl,
  releasePageUrl: axonReleasePageUrl,
  isDev,
  isMac,
  isWindows,
  execFileAsync,
  resolveMacAppBundlePath,
});
updateManager.configureAutoUpdater();
registerUpdateHandlers(updateManager);
registerAppHandlers({
  windowSessionRestore,
  isExternalHandlerUrl,
});
registerDiagnosticsHandlers();
registerExtensionHandlers();
registerGitHandlers();
registerLspHandlers();
registerSettingsHandlers({
  getActiveLanguageServers: () => getActiveLanguageServerSessions(),
  notifyPythonConfigurationForFolder: (folderPath) => {
    const session = [...getActiveLanguageServerSessions()].find(
      (candidate) =>
        candidate.id === "python" &&
        path.resolve(candidate.folderPath) === path.resolve(folderPath),
    );
    if (session)
      notifyLanguageServerConfiguration(session, notifyLanguageServer);
  },
});
registerFileWatcherHandlers(fileWatcherManager);
registerHtmlPreviewHandlers(getHtmlPreviewServer);
registerTaskHandlers(taskManager);

if (!hasDevSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!isDev) return;

  // The development runner can be started more than once while a Vite server
  // is already alive. Without a single-instance guard, each Electron process
  // gets its own Dock icon and its own renderer window, which looks like Axon
  // is spawning copies of itself. The production app still owns normal
  // multi-window behavior through the File menu; this path only collapses
  // duplicate dev launches back onto the current main window.
  const currentMainWindow = mainWindow as BrowserWindow | null;
  let targetWindow: BrowserWindow | null = null;
  if (currentMainWindow !== null && !currentMainWindow.isDestroyed()) {
    targetWindow = currentMainWindow;
  }
  if (!targetWindow) {
    for (const candidate of BrowserWindow.getAllWindows()) {
      if (!candidate.isDestroyed()) {
        targetWindow = candidate;
        break;
      }
    }
  }

  if (!targetWindow) return;

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }
  targetWindow.focus();
});

function getHtmlPreviewServer() {
  if (!htmlPreviewServer) {
    htmlPreviewServer = new HtmlPreviewServer({
      buildWatcherOptions: () => fileWatcherManager.buildWatcherOptions(),
      shouldIgnoreWorkspaceWatchPath: (candidatePath: string) =>
        fileWatcherManager.shouldIgnoreWorkspaceWatchPath(candidatePath),
      sendToRenderer,
    });
  }

  return htmlPreviewServer;
}

function createManagedWindow(options: { restoreSession?: boolean } = {}) {
  const createdWindow = createWindow(
    {
      axonDevServerUrl,
      isDev,
      isMac,
      isWindows,
      getAxonIconPath: () => getAxonIconPath(isDev),
      shouldBlockBrowserShortcut,
      sendMenuCommand,
      createNewWindow: () => {
        createManagedWindow({ restoreSession: false });
      },
    },
    options,
  );

  mainWindow = createdWindow.window;
  const createdWebContentsId = createdWindow.window.webContents.id;
  windowSessionRestore.set(createdWebContentsId, createdWindow.restoreSession);

  createdWindow.window.on("closed", () => {
    // I capture the webContents id before registering this handler because
    // Electron destroys the BrowserWindow and its webContents before `closed`
    // listeners finish. Reading `window.webContents.id` here can throw
    // "Object has been destroyed" during native quit, which turns a normal app
    // shutdown into a scary main-process crash dialog.
    windowSessionRestore.delete(createdWebContentsId);
    if (mainWindow === createdWindow.window) {
      mainWindow =
        BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ??
        null;
    }
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(createdWindow.menu));
  return createdWindow;
}

function shouldBlockBrowserShortcut(input: {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}) {
  const key = input.key.toLowerCase();
  const commandOrControl = input.meta || input.control;

  // Packaged Axon should behave like an editor, not like a browser tab. The
  // default Electron View menu exposes reload and DevTools shortcuts that can
  // wipe renderer state or expose internals. I block those browser-level
  // shortcuts in the main process so they never reach Chromium, while leaving
  // Axon-owned shortcuts like plain F12 available to the renderer.
  if (key === "f5") return true;
  if (commandOrControl && key === "r") return true;
  if (commandOrControl && input.shift && key === "r") return true;
  if (commandOrControl && input.alt && key === "i") return true;
  if (commandOrControl && input.shift && key === "i") return true;

  return false;
}


registerSpotifyProtocolClient();
registerSpotifyOpenUrlHandler({ sendToRenderer });

app.on("second-instance", async (_event, argv) => {
  await handleSpotifySecondInstanceArg(argv, { sendToRenderer });

  // Focus the existing window as normal.
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (existingWindow) {
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!hasDevSingleInstanceLock) return;

  protocol.handle("axon", async (request) => {
    const requestUrl = new URL(request.url);

    const spotifyResponse = await handleSpotifyProtocolRequest(requestUrl, {
      sendToRenderer,
    });
    if (spotifyResponse) return spotifyResponse;

    // axon://local/absolute/path, existing local file serving, unchanged
    const filePath = decodeURIComponent(
      request.url.replace("axon://local", ""),
    );
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  await bundledCore.startBundledAxonCore();
  bundledCore.startBundledCoreWatchdog();
  createManagedWindow({ restoreSession: true });

  // Prefer Axon's bundled Spotify app client_id. It is public PKCE metadata,
  // not a client secret, and lets users connect without creating their own
  // Spotify developer app. Local development can still fall back to settings
  // when the build-time value is intentionally empty.
  const appSettings = readSettingsFromDisk("");
  const spotifyClientId =
    AXON_SPOTIFY_CLIENT_ID || appSettings?.spotify?.clientId || "";
  if (spotifyClientId) setClientId(spotifyClientId);
  registerSpotifyHandlers();
});

app.on("activate", () => {
  if (isQuitting) return;

  const hasLiveWindow = BrowserWindow.getAllWindows().some(
    (window) => !window.isDestroyed(),
  );
  if (!hasLiveWindow) {
    // macOS sends activate when the Dock icon is clicked after all windows are
    // closed. That should open a blank session, not silently restore the last
    // workspace or reopen during a quit/update teardown. Session restore stays
    // reserved for the normal cold app launch path above.
    createManagedWindow({ restoreSession: false });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  isQuitting = true;
  taskManager.stopAll();
  stopAllLanguageServers();
  bundledCore.stopBundledCoreWatchdog();
  bundledCore.stopBundledAxonCore();
  await fileWatcherManager.closeAll();
  await htmlPreviewServer?.close();
});

// register axon:// protocol before app is ready
// this lets the renderer load local files via axon://path/to/file
// without needing file:// which Electron blocks for security
protocol.registerSchemesAsPrivileged([
  {
    scheme: "axon",
    privileges: { secure: true, standard: true, stream: true },
  },
]);
