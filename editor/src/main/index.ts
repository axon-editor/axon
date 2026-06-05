import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  protocol,
  net,
  clipboard,
  shell,
} from "electron";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import url from "url";
import {
  execFile,
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import http, {
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "http";
import { promisify } from "util";
import { autoUpdater } from "electron-updater";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
} from "../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../shared/commands";
import { type EditorDiagnostic } from "../shared/diagnostics";
import {
  type GitActionResult,
  type GitChange,
  type GitDiffResult,
  type GitFileState,
  type GitStatusResult,
} from "../shared/git";
import {
  type TaskFinishedEvent,
  type TaskOutputEvent,
  type TaskRunResult,
  type WorkspaceTask,
} from "../shared/tasks";
import {
  type LanguageServerCompletionItem,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerId,
  type LanguageServerLifecycleResult,
  type LanguageServerStartForFileRequest,
  type LanguageServerStatus,
} from "../shared/lsp";
import {
  type UpdateActionResult,
  type UpdateInfo,
  type UpdateInstallState,
} from "../shared/updates";
import {
  type HtmlPreviewActionResult,
  type HtmlPreviewConsoleEvent,
  type HtmlPreviewTarget,
} from "../shared/htmlPreview";

const isDev = process.env.NODE_ENV === "development";
app.setName("Axon");
configureAutoUpdater();
const execFileAsync = promisify(execFile);

const isMac = process.platform === "darwin";
let mainWindow: BrowserWindow | null = null;
let bundledCoreProcess: ChildProcess | null = null;
const activeTasks = new Map<string, ChildProcessWithoutNullStreams>();
const activeLanguageServers = new Map<string, LanguageServerSession>();
const windowSessionRestore = new Map<number, boolean>();
const axonCorePort = process.env.AXON_CORE_PORT ?? "7777";
const axonReleaseApiUrl =
  "https://api.github.com/repos/GordenArcher/axon/releases/latest";
const axonReleasePageUrl =
  "https://github.com/GordenArcher/axon/releases/latest";
let updateInstallState: UpdateInstallState = { phase: "idle" };
let updateInstallTimeout: ReturnType<typeof setTimeout> | null = null;
let htmlPreviewServer: Server | null = null;
let htmlPreviewRootPath: string | null = null;
let htmlPreviewServerId: string | null = null;
let htmlPreviewBaseUrl: string | null = null;
let htmlPreviewWatcher: FSWatcher | null = null;
let htmlPreviewReloadTimer: ReturnType<typeof setTimeout> | null = null;
const htmlPreviewClients = new Set<ServerResponse>();

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  body?: string;
}

function publishUpdateInstallState(
  nextState: UpdateInstallState,
): UpdateInstallState {
  // The updater lifecycle is owned by Electron's main process because it needs
  // filesystem access, app restart control, and the packaged app metadata that
  // the renderer should never touch directly.
  //
  // I keep the current state cached here before broadcasting it because the
  // update modal may open after a download has already started or completed.
  // Without this cache, the renderer could only react to future events and
  // would show an idle button even though the updater is already mid-flow.
  updateInstallState = nextState;
  sendToRenderer("app:updateState", updateInstallState);
  return updateInstallState;
}

function configureAutoUpdater() {
  // Axon already has its own release-notes check against the GitHub Releases
  // API. The auto-updater is only responsible for downloading and installing
  // the packaged artifact, so I disable automatic downloads here and let the
  // user start that step from the in-app update modal.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    publishUpdateInstallState({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    publishUpdateInstallState({
      phase: "available",
      version: info.version,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    publishUpdateInstallState({
      phase: "not-available",
      version: info.version,
      message: "Axon is current.",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    publishUpdateInstallState({
      phase: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    // Once a package is fully downloaded, a normal user-driven app quit should
    // also finish the update. That matches editors like Zed/VS Code: the app
    // does not interrupt work, but the next restart applies the ready package.
    autoUpdater.autoInstallOnAppQuit = true;
    publishUpdateInstallState({
      phase: "downloaded",
      version: info.version,
      message: "Ready to install.",
    });
  });

  autoUpdater.on("error", (error) => {
    publishUpdateInstallState({
      phase: "error",
      message: error.message,
    });
  });
}

function parseVersionParts(version: string) {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => {
      const number = Number.parseInt(part, 10);
      return Number.isFinite(number) ? number : 0;
    });
}

function compareVersions(left: string, right: string) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function normalizeUpdatePageUrl(candidateUrl?: string) {
  if (!candidateUrl) return axonReleasePageUrl;

  try {
    const parsedUrl = new URL(candidateUrl);
    const isAxonReleaseUrl =
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "github.com" &&
      parsedUrl.pathname.startsWith("/GordenArcher/axon/releases");

    return isAxonReleaseUrl ? parsedUrl.toString() : axonReleasePageUrl;
  } catch {
    return axonReleasePageUrl;
  }
}

function resolveMacAppBundlePath() {
  if (!isMac) return null;

  const appPathParts = process.execPath.split(`${path.sep}Contents${path.sep}`);
  if (appPathParts.length < 2 || !appPathParts[0].endsWith(".app")) {
    return null;
  }

  return appPathParts[0];
}

async function getMacUpdateInstallBlocker() {
  if (!isMac || isDev || !app.isPackaged) return null;

  const appBundlePath = resolveMacAppBundlePath();
  if (!appBundlePath) {
    return "Axon could not locate the macOS app bundle. Download the latest DMG from GitHub.";
  }

  try {
    await execFileAsync("codesign", [
      "--verify",
      "--deep",
      "--strict",
      appBundlePath,
    ]);
    return null;
  } catch {
    return "This Axon macOS build is not code signed, so macOS cannot apply in-app updates. Download the latest DMG from GitHub.";
  }
}

async function checkForAppUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();
  const checkedAt = new Date().toISOString();

  try {
    // I keep update discovery in the main process because it already owns the
    // trusted Electron surface. The renderer only receives a small typed result,
    // so a failed request or a malformed GitHub payload cannot leak networking
    // details into UI state beyond a simple "no update information" message.
    const response = await fetch(axonReleaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Axon/${currentVersion}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}.`);
    }

    const release = (await response.json()) as GitHubReleasePayload;
    const latestVersion = release.tag_name?.replace(/^v/i, "") ?? currentVersion;
    const releaseUrl = release.html_url ?? axonReleasePageUrl;

    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      releaseUrl,
      releaseNotes: release.body?.trim() || "No release notes were provided.",
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update check failed.";
    return {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      releaseUrl: axonReleasePageUrl,
      releaseNotes: "",
      checkedAt,
      error: message,
    };
  }
}

function getAxonCoreHealthUrl() {
  return `http://127.0.0.1:${axonCorePort}/health`;
}

function waitForAxonCore(timeoutMs = 5000) {
  const startedAt = Date.now();

  return new Promise<boolean>((resolve) => {
    const check = () => {
      const request = http.get(getAxonCoreHealthUrl(), (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve(true);
          return;
        }
        retry();
      });

      request.on("error", retry);
      request.setTimeout(750, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 150);
    };

    check();
  });
}

function getBundledCorePath() {
  const binaryName = process.platform === "win32" ? "axon-core.exe" : "axon-core";
  return path.join(process.resourcesPath, "core", binaryName);
}

async function startBundledAxonCore() {
  if (isDev || bundledCoreProcess) return;

  if (await waitForAxonCore(400)) return;

  const corePath = getBundledCorePath();
  if (!fs.existsSync(corePath)) {
    console.error(`bundled axon-core binary was not found at ${corePath}`);
    return;
  }

  // The packaged editor owns axon-core so users can open Axon like a normal
  // desktop app. I still check for an already-running server first because
  // developers may launch a packaged build while testing a local core, and
  // blindly spawning another process would only create a port conflict.
  bundledCoreProcess = spawn(corePath, [], {
    env: {
      ...process.env,
      AXON_CORE_PORT: axonCorePort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  bundledCoreProcess.stdout?.on("data", (chunk) => {
    console.log(`[axon-core] ${chunk.toString().trimEnd()}`);
  });
  bundledCoreProcess.stderr?.on("data", (chunk) => {
    console.error(`[axon-core] ${chunk.toString().trimEnd()}`);
  });
  bundledCoreProcess.on("exit", () => {
    bundledCoreProcess = null;
  });
  bundledCoreProcess.on("error", (err) => {
    console.error("failed to start bundled axon-core:", err);
    bundledCoreProcess = null;
  });

  const ready = await waitForAxonCore();
  if (!ready) {
    console.error("bundled axon-core did not become ready before timeout");
  }
}

function stopBundledAxonCore() {
  if (!bundledCoreProcess || bundledCoreProcess.killed) return;
  bundledCoreProcess.kill();
  bundledCoreProcess = null;
}

function sendMenuCommand(command: AxonCommand) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  sendToRenderer("menu:command", command, targetWindow);
}

function sendToRenderer(
  channel: string,
  payload?: unknown,
  targetWindow = mainWindow,
) {
  // Chokidar and child-process callbacks can fire after the user closes or
  // reloads the Electron window. A BrowserWindow reference can still be
  // non-null while its native object is already destroyed, so every delayed IPC
  // send must pass through this guard instead of calling webContents directly.
  if (!targetWindow || targetWindow.isDestroyed()) return;
  if (targetWindow.webContents.isDestroyed()) return;
  targetWindow.webContents.send(channel, payload);
}

function normalizePreviewRoot(rootPath: string) {
  return path.resolve(rootPath);
}

function isPathInsideRoot(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function getPreviewContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".wasm": "application/wasm",
  };

  return types[extension] ?? "application/octet-stream";
}

function createHtmlPreviewClientScript(serverId: string) {
  const encodedServerId = JSON.stringify(serverId);

  return `
<script data-axon-html-preview>
(() => {
  const serverId = ${encodedServerId};
  const send = (payload) => {
    fetch("/__axon_preview/console", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, ...payload }),
    }).catch(() => {});
  };
  const format = (value) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  ["log", "info", "warn", "error"].forEach((level) => {
    const original = console[level];
    console[level] = (...args) => {
      original.apply(console, args);
      send({ level, message: args.map(format).join(" "), source: location.href });
    };
  });
  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target && target !== window && "tagName" in target) {
      const source = target.src || target.href || "";
      send({ level: "error", message: "Failed to load " + target.tagName.toLowerCase(), source });
      return;
    }
    send({
      level: "error",
      message: event.message || "Runtime error",
      source: event.filename || location.href,
      line: event.lineno,
      column: event.colno,
    });
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    send({ level: "error", message: "Unhandled promise rejection: " + format(event.reason), source: location.href });
  });
  const events = new EventSource("/__axon_preview/events");
  events.onmessage = () => location.reload();
})();
</script>`;
}

function injectHtmlPreviewClient(html: string, serverId: string) {
  const script = createHtmlPreviewClientScript(serverId);
  if (html.includes("data-axon-html-preview")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${script}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${script}</body>`);
  return `${html}${script}`;
}

function writePreviewJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function collectRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Preview console payload is too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleHtmlPreviewConsoleRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    const rawBody = await collectRequestBody(request);
    const payload = JSON.parse(rawBody || "{}") as Partial<HtmlPreviewConsoleEvent>;
    const event: HtmlPreviewConsoleEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      serverId:
        typeof payload.serverId === "string"
          ? payload.serverId
          : (htmlPreviewServerId ?? "preview"),
      level:
        payload.level === "log" ||
        payload.level === "info" ||
        payload.level === "warn" ||
        payload.level === "error"
          ? payload.level
          : "log",
      message:
        typeof payload.message === "string" ? payload.message : String(payload),
      source: typeof payload.source === "string" ? payload.source : undefined,
      line: typeof payload.line === "number" ? payload.line : undefined,
      column: typeof payload.column === "number" ? payload.column : undefined,
      timestamp: Date.now(),
    };

    sendToRenderer("htmlPreview:console", event);
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
  } catch (err) {
    writePreviewJson(response, 400, {
      error: err instanceof Error ? err.message : "Invalid console payload.",
    });
  }
}

function handleHtmlPreviewEventStream(response: ServerResponse) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  response.write("\n");
  htmlPreviewClients.add(response);
  response.on("close", () => htmlPreviewClients.delete(response));
}

function broadcastHtmlPreviewReload(changedPath: string) {
  if (htmlPreviewReloadTimer) clearTimeout(htmlPreviewReloadTimer);

  htmlPreviewReloadTimer = setTimeout(() => {
    const payload = JSON.stringify({ path: changedPath, timestamp: Date.now() });
    for (const client of htmlPreviewClients) {
      if (client.destroyed) {
        htmlPreviewClients.delete(client);
        continue;
      }
      client.write(`data: ${payload}\n\n`);
    }
    sendToRenderer("htmlPreview:changed", {
      path: changedPath,
      serverId: htmlPreviewServerId,
    });
  }, 100);
}

async function serveHtmlPreviewFile(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
) {
  if (!htmlPreviewRootPath || !htmlPreviewServerId) {
    writePreviewJson(response, 503, { error: "Preview server is not ready." });
    return;
  }

  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedRequestPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const requestedPath = path.resolve(
    htmlPreviewRootPath,
    `.${normalizedRequestPath}`,
  );

  // The preview server intentionally behaves like a tiny browser server, but it
  // must never become a general filesystem reader. Every request is resolved
  // relative to the active workspace root and rejected if path normalization
  // would escape that root through "../" traversal.
  if (!isPathInsideRoot(requestedPath, htmlPreviewRootPath)) {
    writePreviewJson(response, 403, { error: "Preview path is outside workspace." });
    return;
  }

  try {
    const stat = await fs.promises.stat(requestedPath);
    const filePath = stat.isDirectory()
      ? path.join(requestedPath, "index.html")
      : requestedPath;
    const contentType = getPreviewContentType(filePath);
    const rawBuffer = await fs.promises.readFile(filePath);

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });

    if (contentType.startsWith("text/html")) {
      response.end(
        injectHtmlPreviewClient(rawBuffer.toString("utf8"), htmlPreviewServerId),
      );
      return;
    }

    response.end(rawBuffer);
  } catch {
    writePreviewJson(response, 404, { error: "Preview file was not found." });
  }
}

async function handleHtmlPreviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const host = request.headers.host ?? "127.0.0.1";
  const requestUrl = new URL(request.url ?? "/", `http://${host}`);

  if (requestUrl.pathname === "/__axon_preview/events") {
    handleHtmlPreviewEventStream(response);
    return;
  }

  if (requestUrl.pathname === "/__axon_preview/console") {
    await handleHtmlPreviewConsoleRequest(request, response);
    return;
  }

  await serveHtmlPreviewFile(request, response, requestUrl);
}

async function closeHtmlPreviewServer() {
  if (htmlPreviewReloadTimer) {
    clearTimeout(htmlPreviewReloadTimer);
    htmlPreviewReloadTimer = null;
  }

  for (const client of htmlPreviewClients) {
    client.end();
  }
  htmlPreviewClients.clear();

  if (htmlPreviewWatcher) {
    await htmlPreviewWatcher.close();
    htmlPreviewWatcher = null;
  }

  if (htmlPreviewServer) {
    const serverToClose = htmlPreviewServer;
    await new Promise<void>((resolve) => serverToClose.close(() => resolve()));
    htmlPreviewServer = null;
  }

  htmlPreviewRootPath = null;
  htmlPreviewServerId = null;
  htmlPreviewBaseUrl = null;
}

async function ensureHtmlPreviewServer(rootPath: string) {
  const normalizedRoot = normalizePreviewRoot(rootPath);
  if (htmlPreviewServer && htmlPreviewRootPath === normalizedRoot) return;

  await closeHtmlPreviewServer();

  htmlPreviewRootPath = normalizedRoot;
  htmlPreviewServerId = `preview-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  htmlPreviewServer = http.createServer((request, response) => {
    void handleHtmlPreviewRequest(request, response);
  });

  await new Promise<void>((resolve, reject) => {
    htmlPreviewServer?.once("error", reject);
    htmlPreviewServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = htmlPreviewServer.address();
  if (!address || typeof address === "string") {
    await closeHtmlPreviewServer();
    throw new Error("Could not bind the HTML preview server.");
  }

  htmlPreviewBaseUrl = `http://127.0.0.1:${address.port}`;
  htmlPreviewWatcher = chokidar.watch(normalizedRoot, {
    ...buildWatcherOptions(),
    ignored: shouldIgnoreWorkspaceWatchPath,
    depth: 8,
  });

  const notifyReload = (changedPath: string) => {
    broadcastHtmlPreviewReload(changedPath);
  };

  htmlPreviewWatcher.on("change", notifyReload);
  htmlPreviewWatcher.on("add", notifyReload);
  htmlPreviewWatcher.on("unlink", notifyReload);
}

function resolveHtmlPreviewRoot(filePath: string, folderPath?: string | null) {
  const resolvedFilePath = path.resolve(filePath);
  if (folderPath) {
    const workspaceRoot = normalizePreviewRoot(folderPath);
    if (isPathInsideRoot(resolvedFilePath, workspaceRoot)) return workspaceRoot;
  }

  return path.dirname(resolvedFilePath);
}

async function getHtmlPreviewTarget(
  filePath: string,
  folderPath?: string | null,
): Promise<HtmlPreviewTarget> {
  const resolvedFilePath = path.resolve(filePath);
  const rootPath = resolveHtmlPreviewRoot(resolvedFilePath, folderPath);

  if (!fs.existsSync(resolvedFilePath)) {
    throw new Error("HTML file does not exist.");
  }

  await ensureHtmlPreviewServer(rootPath);

  if (!htmlPreviewBaseUrl || !htmlPreviewServerId || !htmlPreviewRootPath) {
    throw new Error("HTML preview server did not start.");
  }

  const relativePath = path
    .relative(htmlPreviewRootPath, resolvedFilePath)
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");

  return {
    filePath: resolvedFilePath,
    rootPath: htmlPreviewRootPath,
    serverId: htmlPreviewServerId,
    url: `${htmlPreviewBaseUrl}/${relativePath}`,
  };
}

function closeFocusedWindow() {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  targetWindow?.close();
}

function shouldBlockBrowserShortcut(input: {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}) {
  if (isDev) return false;

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

function buildViewMenu(): MenuItemConstructorOptions {
  if (isDev) return { role: "viewMenu" };

  return {
    label: "View",
    submenu: [
      {
        label: "Command Palette",
        accelerator: "CmdOrCtrl+P",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE),
      },
      {
        label: "Workspace Search",
        accelerator: "CmdOrCtrl+Shift+F",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH),
      },
      {
        label: "File Outline",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_FILE_OUTLINE),
      },
      { type: "separator" },
      {
        label: "Toggle Terminal",
        accelerator: "CmdOrCtrl+J",
        click: () => sendMenuCommand(AXON_COMMANDS.TOGGLE_TERMINAL),
      },
      {
        label: "Toggle Zen Mode",
        accelerator: "CmdOrCtrl+Shift+Z",
        click: () => sendMenuCommand(AXON_COMMANDS.TOGGLE_ZEN_MODE),
      },
    ],
  };
}

function buildApplicationMenu() {
  const axonAppMenu: MenuItemConstructorOptions = {
    label: "Axon",
    submenu: [
      {
        label: "About Axon",
        click: () => sendMenuCommand(AXON_COMMANDS.ABOUT),
      },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [
      ...(!isMac
        ? [
            {
              label: "About Axon",
              click: () => sendMenuCommand(AXON_COMMANDS.ABOUT),
            } satisfies MenuItemConstructorOptions,
          ]
        : []),
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [axonAppMenu] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuCommand(AXON_COMMANDS.NEW_FILE),
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () =>
            createWindow({
              restoreSession: BrowserWindow.getAllWindows().length === 0,
            }),
        },
        {
          label: "Open Folder...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_FOLDER),
        },
        {
          label: "Open Settings JSON",
          accelerator: "CmdOrCtrl+Shift+,",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_SETTINGS_JSON),
        },
        {
          label: "Source Control",
          accelerator: "CmdOrCtrl+Shift+G",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL),
        },
        {
          label: "Open Recent",
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand(AXON_COMMANDS.SAVE),
        },
        {
          label: "Save As...",
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => sendMenuCommand(AXON_COMMANDS.CLOSE_TAB),
        },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+Shift+W",
          click: closeFocusedWindow,
        },
      ],
    },
    { role: "editMenu" },
    buildViewMenu(),
    { role: "windowMenu" },
    helpMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// holds the active chokidar watcher so we can stop it when switching files
let activeWatcher: FSWatcher | null = null;
let folderWatcher: FSWatcher | null = null;
let gitWatcher: FSWatcher | null = null;
const shouldPollWatchers = process.platform === "darwin";

function getUserSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getWorkspaceSettingsPath(folderPath: string) {
  return path.join(folderPath, "axon.json");
}

function getSettingsPath(folderPath?: string | null) {
  if (folderPath) return getWorkspaceSettingsPath(folderPath);
  return getUserSettingsPath();
}

function getCustomFontsDirectory() {
  return path.join(app.getPath("userData"), "fonts");
}

function toAxonLocalUrl(filePath: string) {
  return `axon://local${encodeURI(filePath)}`;
}

function getFontFamilyFromPath(filePath: string) {
  const parsed = path.parse(filePath);
  return parsed.name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function importCustomFontFile(sourcePath: string): CustomFont {
  const allowedExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
  const extension = path.extname(sourcePath).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Unsupported font file type.");
  }

  const fontsDirectory = getCustomFontsDirectory();
  fs.mkdirSync(fontsDirectory, { recursive: true });

  const family = getFontFamilyFromPath(sourcePath);
  const targetPath = path.join(
    fontsDirectory,
    `${family.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}${extension}`,
  );

  // Imported fonts are copied into app-owned storage instead of referencing
  // the user's original download path. That keeps Axon settings portable
  // across project workspaces and prevents a missing Downloads file from
  // breaking font loading weeks later.
  fs.copyFileSync(sourcePath, targetPath);

  return {
    family,
    path: targetPath,
    url: toAxonLocalUrl(targetPath),
  };
}

function getAxonIconPath() {
  if (isDev) {
    // Vite now packages static renderer assets from editor/public so the app
    // icon, splash logo, and file-tree assets all come from the same source of
    // truth. I still keep the old renderer-local path as a fallback because
    // older working trees may have the image there while someone is moving
    // between release branches.
    const devIcon = path.join(app.getAppPath(), "public/axon.png");
    if (fs.existsSync(devIcon)) return devIcon;

    const legacyDevIcon = path.join(
      app.getAppPath(),
      "src/renderer/public/axon.png",
    );
    if (fs.existsSync(legacyDevIcon)) return legacyDevIcon;
  }

  const builtIcon = path.join(__dirname, "../renderer/axon.png");
  if (fs.existsSync(builtIcon)) return builtIcon;

  return path.join(app.getAppPath(), "public/axon.png");
}

function readSettingsFromDisk(settingsPath: string): AxonSettings {
  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const rawSettings = fs.readFileSync(settingsPath, "utf-8");
    return normalizeSettings(JSON.parse(rawSettings));
  } catch (err) {
    console.error("failed to read settings:", err);
    return DEFAULT_SETTINGS;
  }
}

function writeSettingsToDisk(settings: AxonSettings, settingsPath: string) {
  // I normalize before writing so both the app settings file and workspace
  // axon.json are always complete, valid documents. That prevents a broken
  // manual edit from leaking invalid editor options into Monaco on the next
  // launch.
  const normalizedSettings = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(normalizedSettings, null, 2),
    "utf-8",
  );

  return normalizedSettings;
}

function readSettingsForFolder(folderPath?: string | null): AxonSettings {
  if (folderPath) {
    const workspaceSettingsPath = getWorkspaceSettingsPath(folderPath);
    if (fs.existsSync(workspaceSettingsPath)) {
      return readSettingsFromDisk(workspaceSettingsPath);
    }
  }

  return readSettingsFromDisk(getUserSettingsPath());
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

interface LanguageServerDefinition {
  id: LanguageServerId;
  label: string;
  languages: string[];
  command: string;
  args: string[];
  launchArgs: string[];
  workspaceMarkers: string[];
  installHint: string;
  resolveCommand?: (folderPath: string) => {
    command: string;
    args: string[];
    launchCommand: string;
    launchArgs: string[];
    env?: NodeJS.ProcessEnv;
    startable: boolean;
  };
}

interface LanguageServerSession {
  id: LanguageServerId;
  folderPath: string;
  process: ChildProcessWithoutNullStreams;
  requestId: number;
  initialized: boolean;
  stderr: string;
  stdoutBuffer: Buffer;
  pendingRequests: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >;
  syncedDocuments: Map<string, { version: number; languageId: string }>;
}

interface LanguageServerStartAttempt {
  label: string;
  ok: boolean;
  message: string;
}

const LANGUAGE_SERVER_DEFINITIONS: LanguageServerDefinition[] = [
  {
    id: "typescript",
    label: "TypeScript",
    languages: ["TypeScript", "JavaScript"],
    command: "typescript-language-server",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint: "Install typescript-language-server and typescript.",
    resolveCommand: (folderPath) => {
      const workspaceServer = path.join(
        folderPath,
        "node_modules/.bin/typescript-language-server",
      );
      const workspaceTsc = path.join(
        folderPath,
        "node_modules/typescript/lib/tsserver.js",
      );
      const bundledServer = path.join(
        app.getAppPath(),
        "node_modules/typescript-language-server/lib/cli.mjs",
      );
      const runBundledServerWithElectronNode = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      };

      if (fs.existsSync(workspaceServer)) {
        return {
          command: workspaceServer,
          args: ["--version"],
          launchCommand: workspaceServer,
          launchArgs: ["--stdio"],
          startable: true,
        };
      }

      // Packaged Electron apps cannot rely on the user's shell PATH, and many
      // users should not have to install TypeScript tooling globally just to
      // get normal editor completion. Axon ships the TypeScript language
      // server as an app dependency and runs its CLI through Electron's Node
      // mode, which gives us a real LSP process without requiring a separate
      // Node binary to be installed on the machine.
      if (fs.existsSync(bundledServer)) {
        return {
          command: process.execPath,
          args: [bundledServer, "--version"],
          launchCommand: process.execPath,
          launchArgs: [bundledServer, "--stdio"],
          env: runBundledServerWithElectronNode,
          startable: true,
        };
      }

      // The standalone language server is ideal, but a workspace TypeScript
      // install is still meaningful foundation data. It tells Axon the project
      // has the tsserver engine that a later client can spawn through a small
      // adapter instead of relying on Monaco's isolated TypeScript worker.
      if (fs.existsSync(workspaceTsc)) {
        return {
          command: workspaceTsc,
          args: [],
          launchCommand: workspaceTsc,
          launchArgs: [],
          startable: false,
        };
      }

      return {
        command: "typescript-language-server",
        args: ["--version"],
        launchCommand: "typescript-language-server",
        launchArgs: ["--stdio"],
        startable: true,
      };
    },
  },
  {
    id: "cpp",
    label: "C++",
    languages: ["C", "C++"],
    command: "clangd",
    args: ["--version"],
    launchArgs: ["--background-index", "--stdio"],
    workspaceMarkers: [
      "compile_commands.json",
      "CMakeLists.txt",
      "meson.build",
      "Makefile",
    ],
    // clangd is the practical C/C++ server for Axon because it can attach to
    // existing build metadata when the project already has it, but it still
    // gives us a clean installation check when the binary is missing. That
    // keeps the settings UI honest: the workspace may be a C++ project, but
    // Axon only claims the server is startable when the actual executable is
    // available on PATH.
    installHint: "Install clangd.",
  },
  {
    id: "go",
    label: "Go",
    languages: ["Go"],
    command: "gopls",
    args: ["version"],
    launchArgs: [],
    workspaceMarkers: ["go.mod", "go.work"],
    installHint: "Install gopls.",
  },
  {
    id: "rust",
    label: "Rust",
    languages: ["Rust"],
    command: "rust-analyzer",
    args: ["--version"],
    launchArgs: [],
    workspaceMarkers: ["Cargo.toml"],
    installHint: "Install rust-analyzer.",
  },
  {
    id: "python",
    label: "Python",
    languages: ["Python"],
    command: "pyright-langserver",
    args: ["--version"],
    launchArgs: ["--stdio"],
    workspaceMarkers: ["pyproject.toml", "setup.py", "requirements.txt"],
    installHint: "Install pyright.",
  },
];

function hasWorkspaceMarker(folderPath: string, markers: string[]) {
  return markers.some((marker) => fs.existsSync(path.join(folderPath, marker)));
}

function getLanguageServerSessionKey(
  folderPath: string,
  id: LanguageServerId,
) {
  return `${path.resolve(folderPath)}::${id}`;
}

function resolveLanguageServerCommand(
  definition: LanguageServerDefinition,
  folderPath: string,
) {
  return (
    definition.resolveCommand?.(folderPath) ?? {
      command: definition.command,
      args: definition.args,
      launchCommand: definition.command,
      launchArgs: definition.launchArgs,
      env: process.env,
      startable: true,
    }
  );
}

function getExecutableSearchDirectories() {
  // Electron apps launched from the dock or app bundle do not always inherit
  // the same PATH the user sees in their shell. That is why Axon looks in a
  // small set of common install locations before declaring a language server
  // missing. The goal is not to guess blindly; it is to cover the common
  // Homebrew, Xcode, rustup, pyenv, and Go bin paths that developers already
  // use when they install editor tooling locally.
  const dirs = new Set<string>();
  const home = process.env.HOME ?? "";

  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    if (entry.trim()) dirs.add(entry.trim());
  }

  if (home) {
    dirs.add(path.join(home, ".local", "bin"));
    dirs.add(path.join(home, ".cargo", "bin"));
    dirs.add(path.join(home, "go", "bin"));
  }

  if (process.platform === "darwin") {
    [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      "/Library/Developer/CommandLineTools/usr/bin",
      "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin",
      "/usr/bin",
      "/bin",
    ].forEach((dir) => dirs.add(dir));
  } else if (process.platform === "linux") {
    ["/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/bin"].forEach((dir) =>
      dirs.add(dir),
    );
  } else if (process.platform === "win32") {
    [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].forEach((dir) => {
      if (dir) dirs.add(dir);
    });
  }

  return Array.from(dirs);
}

function resolveCommandPath(command: string) {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;

  const commandVariants =
    process.platform === "win32"
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command];

  for (const dir of getExecutableSearchDirectories()) {
    for (const candidate of commandVariants) {
      const resolved = path.join(dir, candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  return command;
}

async function canRunCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const resolvedCommand = resolveCommandPath(command);
  if (path.isAbsolute(resolvedCommand) && fs.existsSync(resolvedCommand) && args.length === 0) {
    return true;
  }

  try {
    await execFileAsync(resolvedCommand, args, {
      env,
      timeout: 3000,
      maxBuffer: 1024 * 256,
    });
    return true;
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const stderr = (err as { stderr?: string }).stderr ?? "";

    // Some language-server binaries print their version to stderr or exit with
    // a non-zero code for --version. If the executable was found and produced
    // output, Axon can still treat it as available for the future client path.
    return code !== "ENOENT" && `${stdout}${stderr}`.trim().length > 0;
  }
}

function writeLanguageServerMessage(
  session: LanguageServerSession,
  payload: unknown,
) {
  const body = JSON.stringify(payload);
  if (session.process.stdin.destroyed || !session.process.stdin.writable) {
    throw new Error(`${session.id} language server stdin is not writable.`);
  }
  session.process.stdin.write(
    `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`,
  );
}

function rejectLanguageServerPendingRequests(
  session: LanguageServerSession,
  reason: Error,
) {
  for (const pending of session.pendingRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(reason);
  }
  session.pendingRequests.clear();
}

function handleLanguageServerPayload(
  session: LanguageServerSession,
  payload: unknown,
) {
  if (!payload || typeof payload !== "object") return;

  const message = payload as {
    id?: unknown;
    result?: unknown;
    error?: { message?: string };
  };
  if (typeof message.id !== "number") return;

  const pending = session.pendingRequests.get(message.id);
  if (!pending) return;

  clearTimeout(pending.timeout);
  session.pendingRequests.delete(message.id);

  if (message.error) {
    pending.reject(
      new Error(message.error.message ?? `${session.id} request failed.`),
    );
    return;
  }

  pending.resolve(message.result);
}

function readLanguageServerMessages(
  session: LanguageServerSession,
  chunk: Buffer,
) {
  session.stdoutBuffer = Buffer.concat([session.stdoutBuffer, chunk]);

  while (session.stdoutBuffer.length > 0) {
    const headerEnd = session.stdoutBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const header = session.stdoutBuffer.slice(0, headerEnd).toString("utf-8");
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (!lengthMatch) {
      session.stdoutBuffer = Buffer.alloc(0);
      return;
    }

    const bodyLength = Number(lengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + bodyLength;
    if (session.stdoutBuffer.length < bodyEnd) return;

    const body = session.stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf-8");
    session.stdoutBuffer = session.stdoutBuffer.slice(bodyEnd);

    try {
      handleLanguageServerPayload(session, JSON.parse(body));
    } catch {
      // Language servers occasionally emit telemetry/log messages. A malformed
      // payload should not poison the whole session; the next framed message can
      // still satisfy an editor request.
    }
  }
}

function requestLanguageServer(
  session: LanguageServerSession,
  method: string,
  params: unknown,
  timeoutMs = 4500,
) {
  session.requestId += 1;
  const id = session.requestId;

  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(id);
      reject(new Error(`${session.id} ${method} timed out.`));
    }, timeoutMs);

    session.pendingRequests.set(id, { resolve, reject, timeout });

    try {
      writeLanguageServerMessage(session, {
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    } catch (err) {
      clearTimeout(timeout);
      session.pendingRequests.delete(id);
      reject(err instanceof Error ? err : new Error(`${method} failed.`));
    }
  });
}

function notifyLanguageServer(
  session: LanguageServerSession,
  method: string,
  params: unknown,
) {
  writeLanguageServerMessage(session, {
    jsonrpc: "2.0",
    method,
    params,
  });
}

function initializeLanguageServer(session: LanguageServerSession) {
  // This is a minimal LSP handshake, not the full client. The important part
  // for this slice is proving Axon can own the server process and negotiate a
  // workspace root from the main process. Diagnostics, document sync, and
  // definition requests can now build on this session instead of inventing a
  // separate process lifecycle later.
  void requestLanguageServer(
    session,
    "initialize",
    {
      processId: process.pid,
      rootUri: url.pathToFileURL(session.folderPath).toString(),
      workspaceFolders: [
        {
          uri: url.pathToFileURL(session.folderPath).toString(),
          name: path.basename(session.folderPath),
        },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
          completion: {
            completionItem: {
              documentationFormat: ["markdown", "plaintext"],
              snippetSupport: true,
            },
            contextSupport: true,
            dynamicRegistration: false,
          },
        },
      },
    },
    7000,
  )
    .then(() => {
      notifyLanguageServer(session, "initialized", {});
      session.initialized = true;
    })
    .catch((err) => {
      session.stderr = `${session.stderr}\n${err.message}`.slice(-4000);
    });
}

function stopLanguageServerSession(key: string) {
  const session = activeLanguageServers.get(key);
  if (!session) return;

  try {
    writeLanguageServerMessage(session, {
      jsonrpc: "2.0",
      id: session.requestId + 1,
      method: "shutdown",
      params: null,
    });
    writeLanguageServerMessage(session, {
      jsonrpc: "2.0",
      method: "exit",
      params: {},
    });
  } catch {
    // The process may already be exiting. The cleanup below still removes the
    // stale session and kills anything that did not accept the graceful exit.
  }

  rejectLanguageServerPendingRequests(
    session,
    new Error(`${session.id} language server stopped.`),
  );
  session.process.kill();
  activeLanguageServers.delete(key);
}

function stopLanguageServersForFolder(folderPath: string) {
  const resolvedFolder = path.resolve(folderPath);
  for (const [key, session] of activeLanguageServers.entries()) {
    if (path.resolve(session.folderPath) === resolvedFolder) {
      stopLanguageServerSession(key);
    }
  }
}

function stopAllLanguageServers() {
  for (const key of activeLanguageServers.keys()) {
    stopLanguageServerSession(key);
  }
}

function waitForLanguageServerSpawn(
  child: ChildProcessWithoutNullStreams,
  label: string,
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, 350);

    const cleanup = () => {
      clearTimeout(timeout);
      child.off("spawn", handleSpawn);
      child.off("error", handleError);
      child.off("exit", handleExit);
    };

    const handleSpawn = () => {
      cleanup();
      resolve();
    };

    const handleError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `${label} exited before initialization${code !== null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}.`,
        ),
      );
    };

    child.once("spawn", handleSpawn);
    child.once("error", handleError);
    child.once("exit", handleExit);
  });
}

async function getLanguageServerStatus(
  folderPath: string,
): Promise<LanguageServerStatus[]> {
  return Promise.all(
    LANGUAGE_SERVER_DEFINITIONS.map(async (definition) => {
      const resolved = resolveLanguageServerCommand(definition, folderPath);
      const relevant = hasWorkspaceMarker(folderPath, definition.workspaceMarkers);
      const available = await canRunCommand(resolved.command, resolved.args);
      const running = activeLanguageServers.has(
        getLanguageServerSessionKey(folderPath, definition.id),
      );

      return {
        id: definition.id,
        label: definition.label,
        languages: definition.languages,
        available,
        relevant,
        running,
        startable: resolved.startable,
        command: resolved.command,
        detail: running
          ? "Running for this workspace"
          : available
          ? relevant
            ? "Ready for this workspace"
            : "Installed but no matching workspace markers found"
          : relevant
            ? "Relevant, but language server is not installed"
            : "Not installed",
        installHint: definition.installHint,
      };
    }),
  );
}

async function startLanguageServerDefinition(
  folderPath: string,
  definition: LanguageServerDefinition,
): Promise<LanguageServerStartAttempt> {
  const resolved = resolveLanguageServerCommand(definition, folderPath);
  const key = getLanguageServerSessionKey(folderPath, definition.id);
  if (activeLanguageServers.has(key)) {
    return {
      label: definition.label,
      ok: true,
      message: `${definition.label} is already running.`,
    };
  }

  const available = await canRunCommand(
    resolved.command,
    resolved.args,
    resolved.env,
  );
  if (!available) {
    return {
      label: definition.label,
      ok: false,
      message: `${definition.label}: ${definition.installHint}`,
    };
  }
  if (!resolved.startable) {
    return {
      label: definition.label,
      ok: false,
      message: `${definition.label}: ${definition.installHint}`,
    };
  }

  const launchCommand = resolveCommandPath(resolved.launchCommand);

  try {
    const child = spawn(launchCommand, resolved.launchArgs, {
      cwd: folderPath,
      env: resolved.env,
      stdio: "pipe",
    });
    const session: LanguageServerSession = {
      id: definition.id,
      folderPath,
      process: child,
      requestId: 0,
      initialized: false,
      stderr: "",
      stdoutBuffer: Buffer.alloc(0),
      pendingRequests: new Map(),
      syncedDocuments: new Map(),
    };

    await waitForLanguageServerSpawn(child, definition.label);
    activeLanguageServers.set(key, session);

    child.stdout.on("data", (chunk: Buffer) => {
      readLanguageServerMessages(session, chunk);
    });
    child.stderr.on("data", (chunk) => {
      session.stderr = `${session.stderr}${chunk.toString()}`.slice(-4000);
    });
    child.on("exit", () => {
      rejectLanguageServerPendingRequests(
        session,
        new Error(`${definition.label} language server exited.`),
      );
      activeLanguageServers.delete(key);
    });
    child.on("error", () => {
      rejectLanguageServerPendingRequests(
        session,
        new Error(`${definition.label} language server failed.`),
      );
      activeLanguageServers.delete(key);
    });

    initializeLanguageServer(session);
    return {
      label: definition.label,
      ok: true,
      message: `${definition.label} started.`,
    };
  } catch (err) {
    activeLanguageServers.delete(key);
    return {
      label: definition.label,
      ok: false,
      message: `${definition.label}: ${(err as Error).message}`,
    };
  }
}

async function startRelevantLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  const statuses = await getLanguageServerStatus(folderPath);
  const startableServers = statuses.filter(
    (server) =>
      server.relevant && server.available && server.startable && !server.running,
  );
  const attempts: LanguageServerStartAttempt[] = [];

  for (const status of startableServers) {
    const definition = LANGUAGE_SERVER_DEFINITIONS.find(
      (candidate) => candidate.id === status.id,
    );
    if (!definition) continue;
    attempts.push(await startLanguageServerDefinition(folderPath, definition));
  }

  const nextStatuses = await getLanguageServerStatus(folderPath);
  const failedAttempts = attempts.filter((attempt) => !attempt.ok);
  const startedCount = attempts.filter((attempt) => attempt.ok).length;
  return {
    ok: failedAttempts.length === 0,
    message:
      startableServers.length === 0
        ? "No relevant language servers needed to start."
        : failedAttempts.length > 0
          ? `Started ${startedCount}. Failed: ${failedAttempts.map((attempt) => attempt.message).join("; ")}`
          : `Started ${startedCount} language server${startedCount === 1 ? "" : "s"}.`,
    servers: nextStatuses,
  };
}

async function startLanguageServerForLanguage(
  folderPath: string,
  languageId: string,
): Promise<LanguageServerLifecycleResult> {
  const serverId = resolveLanguageServerIdForMonacoLanguage(languageId);
  if (!serverId) {
    return {
      ok: true,
      message: `No external language server is configured for ${languageId}.`,
      servers: await getLanguageServerStatus(folderPath),
    };
  }

  const definition = LANGUAGE_SERVER_DEFINITIONS.find(
    (candidate) => candidate.id === serverId,
  );
  if (!definition) {
    return {
      ok: false,
      message: `No language server definition found for ${languageId}.`,
      servers: await getLanguageServerStatus(folderPath),
    };
  }

  // Marker-based startup is useful when a workspace opens, but completions are
  // driven by the active document. Starting the server for the file language
  // means a lone .py, .rs, .go, or .cpp file can still attach to its server
  // instead of waiting for a project marker that may not exist yet.
  const attempt = await startLanguageServerDefinition(folderPath, definition);
  return {
    ok: attempt.ok,
    message: attempt.message,
    servers: await getLanguageServerStatus(folderPath),
  };
}

async function stopRelevantLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  const beforeCount = Array.from(activeLanguageServers.values()).filter(
    (session) => path.resolve(session.folderPath) === path.resolve(folderPath),
  ).length;

  stopLanguageServersForFolder(folderPath);

  return {
    ok: true,
    message:
      beforeCount === 0
        ? "No language servers were running for this workspace."
        : `Stopped ${beforeCount} language server${beforeCount === 1 ? "" : "s"}.`,
    servers: await getLanguageServerStatus(folderPath),
  };
}

function resolveLanguageServerIdForMonacoLanguage(languageId: string) {
  const normalizedLanguageId = languageId.toLowerCase();
  if (normalizedLanguageId === "typescript" || normalizedLanguageId === "javascript") {
    return "typescript" satisfies LanguageServerId;
  }
  if (normalizedLanguageId === "go") return "go" satisfies LanguageServerId;
  if (normalizedLanguageId === "rust") return "rust" satisfies LanguageServerId;
  if (normalizedLanguageId === "python") return "python" satisfies LanguageServerId;
  if (normalizedLanguageId === "cpp" || normalizedLanguageId === "c") {
    return "cpp" satisfies LanguageServerId;
  }

  return null;
}

function syncLanguageServerDocument(
  session: LanguageServerSession,
  request: LanguageServerCompletionRequest,
) {
  const uri = url.pathToFileURL(request.filePath).toString();
  const existingDocument = session.syncedDocuments.get(uri);
  const languageId = request.languageId === "cpp" ? "cpp" : request.languageId;

  if (!existingDocument) {
    // Completion only makes sense if the server has the latest in-memory text.
    // Axon editors can be dirty, so reading from disk here would make the LSP
    // complete against stale content. Full-text didOpen/didChange is heavier
    // than incremental ranges, but it is deterministic and works across the
    // first server set while the client layer is still small.
    notifyLanguageServer(session, "textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: request.content,
      },
    });
    session.syncedDocuments.set(uri, { version: 1, languageId });
    return uri;
  }

  const nextVersion = existingDocument.version + 1;
  notifyLanguageServer(session, "textDocument/didChange", {
    textDocument: {
      uri,
      version: nextVersion,
    },
    contentChanges: [{ text: request.content }],
  });
  session.syncedDocuments.set(uri, {
    version: nextVersion,
    languageId: existingDocument.languageId,
  });
  return uri;
}

function normalizeCompletionDocumentation(documentation: unknown) {
  if (typeof documentation === "string") return documentation;
  if (
    documentation &&
    typeof documentation === "object" &&
    "value" in documentation &&
    typeof documentation.value === "string"
  ) {
    return documentation.value;
  }

  return undefined;
}

function normalizeLanguageServerTextPosition(position: unknown) {
  if (!position || typeof position !== "object") return undefined;
  const rawPosition = position as { line?: unknown; character?: unknown };
  if (
    typeof rawPosition.line !== "number" ||
    typeof rawPosition.character !== "number"
  ) {
    return undefined;
  }

  return {
    line: Math.max(0, rawPosition.line),
    character: Math.max(0, rawPosition.character),
  };
}

function normalizeLanguageServerTextEdit(edit: unknown) {
  if (!edit || typeof edit !== "object") return undefined;
  const rawEdit = edit as {
    range?: unknown;
    newText?: unknown;
  };
  if (typeof rawEdit.newText !== "string") return undefined;
  if (!rawEdit.range || typeof rawEdit.range !== "object") return undefined;

  const rawRange = rawEdit.range as { start?: unknown; end?: unknown };
  const start = normalizeLanguageServerTextPosition(rawRange.start);
  const end = normalizeLanguageServerTextPosition(rawRange.end);
  if (!start || !end) return undefined;

  return {
    range: { start, end },
    newText: rawEdit.newText,
  };
}

function normalizeLanguageServerTextEdits(edits: unknown) {
  if (!Array.isArray(edits)) return undefined;
  const normalizedEdits = edits
    .map(normalizeLanguageServerTextEdit)
    .filter((edit): edit is NonNullable<typeof edit> => edit !== undefined);

  return normalizedEdits.length > 0 ? normalizedEdits : undefined;
}

function normalizeLanguageServerCompletionItems(
  result: unknown,
): LanguageServerCompletionItem[] {
  const rawItems = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "items" in result && Array.isArray(result.items)
      ? result.items
      : [];

  return rawItems
    .map((item): LanguageServerCompletionItem | null => {
      if (!item || typeof item !== "object" || !("label" in item)) return null;
      const completionItem = item as {
        label?: unknown;
        kind?: unknown;
        detail?: unknown;
        documentation?: unknown;
        insertText?: unknown;
        insertTextFormat?: unknown;
        filterText?: unknown;
        sortText?: unknown;
        commitCharacters?: unknown;
        preselect?: unknown;
        textEdit?: unknown;
        additionalTextEdits?: unknown;
      };
      if (typeof completionItem.label !== "string") return null;

      // LSP completion items contain more than a visible label. Servers use
      // textEdit to replace the exact typed range, insertTextFormat to mark
      // snippets, commitCharacters to accept on keys like "." or "(", and
      // additionalTextEdits for things like auto-imports. Axon keeps this
      // payload narrow and validated before it crosses IPC so the renderer can
      // feel like a real editor without receiving arbitrary server objects.
      const textEdit = normalizeLanguageServerTextEdit(
        completionItem.textEdit,
      );
      const additionalTextEdits = normalizeLanguageServerTextEdits(
        completionItem.additionalTextEdits,
      );

      return {
        label: completionItem.label,
        kind:
          typeof completionItem.kind === "number"
            ? completionItem.kind
            : undefined,
        detail:
          typeof completionItem.detail === "string"
            ? completionItem.detail
            : undefined,
        documentation: normalizeCompletionDocumentation(
          completionItem.documentation,
        ),
        insertText:
          typeof completionItem.insertText === "string"
            ? completionItem.insertText
            : undefined,
        insertTextFormat:
          typeof completionItem.insertTextFormat === "number"
            ? completionItem.insertTextFormat
            : undefined,
        filterText:
          typeof completionItem.filterText === "string"
            ? completionItem.filterText
            : undefined,
        sortText:
          typeof completionItem.sortText === "string"
            ? completionItem.sortText
            : undefined,
        commitCharacters: Array.isArray(completionItem.commitCharacters)
          ? completionItem.commitCharacters.filter(
              (character): character is string => typeof character === "string",
            )
          : undefined,
        preselect:
          typeof completionItem.preselect === "boolean"
            ? completionItem.preselect
            : undefined,
        textEdit,
        additionalTextEdits,
      };
    })
    .filter((item): item is LanguageServerCompletionItem => item !== null)
    .slice(0, 200);
}

async function getLanguageServerCompletions(
  request: LanguageServerCompletionRequest,
): Promise<LanguageServerCompletionResult> {
  const serverId = resolveLanguageServerIdForMonacoLanguage(request.languageId);
  if (!serverId) {
    return { ok: true, items: [] };
  }

  const session = activeLanguageServers.get(
    getLanguageServerSessionKey(request.folderPath, serverId),
  );
  if (!session) {
    return {
      ok: false,
      message: `${serverId} language server is not running.`,
      items: [],
    };
  }
  if (!session.initialized) {
    return {
      ok: false,
      message: `${serverId} language server is still starting.`,
      items: [],
    };
  }

  try {
    const uri = syncLanguageServerDocument(session, request);
    const completionResult = await requestLanguageServer(
      session,
      "textDocument/completion",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
        context: {
          triggerKind: request.triggerCharacter ? 2 : 1,
          triggerCharacter: request.triggerCharacter,
        },
      },
    );

    return {
      ok: true,
      items: normalizeLanguageServerCompletionItems(completionResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server completion failed.",
      items: [],
    };
  }
}

function getWorkspaceTasks(folderPath: string): WorkspaceTask[] {
  // Tasks are detected in the main process instead of letting the renderer send
  // arbitrary shell strings. That gives Axon a real task runner while keeping
  // the first implementation constrained to project-owned commands that are
  // already declared in package.json, go.mod, or Cargo.toml.
  const tasks: WorkspaceTask[] = [];
  const packageJsonPath = path.join(folderPath, "package.json");
  const packageJson = readJsonFile<{ scripts?: Record<string, string> }>(
    packageJsonPath,
  );

  if (packageJson?.scripts) {
    for (const [scriptName, scriptCommand] of Object.entries(
      packageJson.scripts,
    )) {
      tasks.push({
        id: `npm:${scriptName}`,
        kind: "npm",
        label: `npm run ${scriptName}`,
        detail: scriptCommand,
      });
    }
  }

  if (fs.existsSync(path.join(folderPath, "go.mod"))) {
    tasks.push(
      {
        id: "go:test",
        kind: "go",
        label: "go test ./...",
        detail: "Run all Go package tests",
      },
      {
        id: "go:build",
        kind: "go",
        label: "go build ./...",
        detail: "Build all Go packages",
      },
    );
  }

  if (fs.existsSync(path.join(folderPath, "Cargo.toml"))) {
    tasks.push(
      {
        id: "cargo:test",
        kind: "cargo",
        label: "cargo test",
        detail: "Run Cargo tests",
      },
      {
        id: "cargo:build",
        kind: "cargo",
        label: "cargo build",
        detail: "Build the Cargo package",
      },
    );
  }

  return tasks;
}

function getTaskCommand(task: WorkspaceTask) {
  if (task.kind === "npm") {
    const scriptName = task.id.slice("npm:".length);
    return {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["run", scriptName],
    };
  }

  if (task.id === "go:test") return { command: "go", args: ["test", "./..."] };
  if (task.id === "go:build") {
    return { command: "go", args: ["build", "./..."] };
  }
  if (task.id === "cargo:test") return { command: "cargo", args: ["test"] };
  return { command: "cargo", args: ["build"] };
}

function sendTaskOutput(event: TaskOutputEvent) {
  sendToRenderer("task:output", event);
}

function sendTaskFinished(event: TaskFinishedEvent) {
  sendToRenderer("task:finished", event);
}

function streamTaskOutput(
  runId: string,
  task: WorkspaceTask,
  stream: "stdout" | "stderr",
  chunk: Buffer,
  buffer: { value: string },
) {
  buffer.value += chunk.toString();
  const lines = buffer.value.split(/\r?\n/);
  buffer.value = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    sendTaskOutput({
      runId,
      taskId: task.id,
      label: task.label,
      stream,
      line,
    });
  }
}

function startWorkspaceTask(
  folderPath: string,
  taskId: string,
): TaskRunResult {
  // The renderer sends only a task id. I re-detect the task right before
  // execution so stale UI state cannot run a command that no longer belongs to
  // the current workspace after package.json or the folder changes.
  const task = getWorkspaceTasks(folderPath).find(
    (candidate) => candidate.id === taskId,
  );
  if (!task) {
    throw new Error("Task is no longer available in this workspace.");
  }

  const runId = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const { command, args } = getTaskCommand(task);
  // spawn gives us streaming stdout/stderr, which is the important behavior for
  // build tools. execFile would only return after the command ends, making the
  // Output panel feel frozen during long tests or builds.
  const child = spawn(command, args, {
    cwd: folderPath,
    env: process.env,
  });
  const stdoutBuffer = { value: "" };
  const stderrBuffer = { value: "" };

  activeTasks.set(runId, child);
  sendTaskOutput({
    runId,
    taskId: task.id,
    label: task.label,
    stream: "system",
    line: `$ ${[command, ...args].join(" ")}`,
  });

  child.stdout.on("data", (chunk: Buffer) => {
    streamTaskOutput(runId, task, "stdout", chunk, stdoutBuffer);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    streamTaskOutput(runId, task, "stderr", chunk, stderrBuffer);
  });
  child.on("error", (err) => {
    sendTaskOutput({
      runId,
      taskId: task.id,
      label: task.label,
      stream: "stderr",
      line: err.message,
    });
  });
  child.on("close", (exitCode, signal) => {
    if (stdoutBuffer.value.trim()) {
      sendTaskOutput({
        runId,
        taskId: task.id,
        label: task.label,
        stream: "stdout",
        line: stdoutBuffer.value.trimEnd(),
      });
    }
    if (stderrBuffer.value.trim()) {
      sendTaskOutput({
        runId,
        taskId: task.id,
        label: task.label,
        stream: "stderr",
        line: stderrBuffer.value.trimEnd(),
      });
    }
    activeTasks.delete(runId);
    sendTaskFinished({
      runId,
      taskId: task.id,
      label: task.label,
      exitCode,
      signal,
    });
  });

  return { runId, task };
}

function stopActiveTasks() {
  // Tasks are child processes owned by Axon. If the app quits while a build is
  // still running, leaving those processes alive would make the Output panel
  // lie on the next launch and could keep project tools running in the
  // background without a visible owner.
  for (const taskProcess of activeTasks.values()) {
    if (!taskProcess.killed) taskProcess.kill();
  }
  activeTasks.clear();
}

function ensureSettingsFile(folderPath?: string | null, settings?: unknown) {
  const settingsPath = getSettingsPath(folderPath);
  const sourceSettings =
    settings ??
    (fs.existsSync(settingsPath)
      ? readSettingsFromDisk(settingsPath)
      : readSettingsForFolder(folderPath));

  writeSettingsToDisk(normalizeSettings(sourceSettings), settingsPath);
  return settingsPath;
}

async function runGit(
  folderPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", ["-C", folderPath, ...args], {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 8,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function toGitFileState(status: string): GitFileState {
  switch (status) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    default:
      return "unknown";
  }
}

function parseGitStatus(root: string, statusOutput: string): GitChange[] {
  return statusOutput
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line): GitChange => {
      const indexCode = line[0] ?? " ";
      const worktreeCode = line[1] ?? " ";
      const rawPath = line.slice(3);
      const [oldPath, nextPath] = rawPath.includes(" -> ")
        ? rawPath.split(" -> ")
        : [null, rawPath];
      const filePath = nextPath ?? rawPath;

      return {
        path: filePath,
        absolutePath: path.resolve(root, filePath),
        oldPath,
        indexState: toGitFileState(indexCode),
        worktreeState: toGitFileState(worktreeCode),
        staged: indexCode !== " " && indexCode !== "?",
        unstaged: worktreeCode !== " " || indexCode === "?",
      };
    })
    .filter((change) => change.path.length > 0);
}

function parseGitIgnoredPaths(root: string, ignoredOutput: string): string[] {
  return ignoredOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((ignoredPath) => path.resolve(root, ignoredPath.replace(/\/$/, "")));
}

async function getGitStatus(folderPath: string): Promise<GitStatusResult> {
  try {
    const rootResult = await runGit(folderPath, ["rev-parse", "--show-toplevel"]);
    const root = rootResult.stdout.trim();
    const branchResult = await runGit(folderPath, [
      "branch",
      "--show-current",
    ]);
    const statusResult = await runGit(folderPath, ["status", "--porcelain=v1"]);
    const ignoredResult = await runGit(root, [
      "ls-files",
      "--ignored",
      "--exclude-standard",
      "--others",
      "--directory",
    ]);

    return {
      isRepository: true,
      root,
      branch: branchResult.stdout.trim() || "detached",
      changes: parseGitStatus(root, statusResult.stdout),
      ignoredPaths: parseGitIgnoredPaths(root, ignoredResult.stdout),
    };
  } catch {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
      ignoredPaths: [],
    };
  }
}

async function getGitDiff(
  folderPath: string,
  filePath: string,
  staged: boolean,
  untracked: boolean,
): Promise<GitDiffResult> {
  const status = await getGitStatus(folderPath);
  const root = status.root ?? folderPath;
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;

  const readDiff = async (args: string[]) => {
    try {
      const result = await runGit(root, args);
      return result.stdout || result.stderr;
    } catch (err) {
      return `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`;
    }
  };

  // Git can report the same path as both staged and unstaged. The UI should
  // still show useful context in that case, so I try the requested side first
  // and then fall back to the other side if Git returns an empty diff.
  const diffRequests = untracked
    ? [["diff", "--no-index", "--", "/dev/null", relativePath]]
    : staged
      ? [
          ["diff", "--cached", "--", relativePath],
          ["diff", "--", relativePath],
        ]
      : [
          ["diff", "--", relativePath],
          ["diff", "--cached", "--", relativePath],
        ];

  for (const args of diffRequests) {
    const diff = await readDiff(args);
    if (diff.trim().length > 0) {
      return {
        path: relativePath,
        diff,
      };
    }
  }

  return {
    path: relativePath,
    diff: "",
  };
}

async function getGitFileBase(
  folderPath: string,
  filePath: string,
): Promise<string> {
  const status = await getGitStatus(folderPath);
  const root = status.root ?? folderPath;
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;

  try {
    const result = await runGit(root, ["show", `HEAD:${relativePath}`]);
    return result.stdout;
  } catch {
    // A new/untracked file has no committed base. Returning an empty original
    // lets the diff editor still show the whole current file as an addition
    // instead of failing the compare flow.
    return "";
  }
}

function getGitRelativePath(root: string, filePath: string) {
  return path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
}

async function runGitAction(
  folderPath: string,
  filePath: string,
  action: "stage" | "unstage" | "discard",
): Promise<GitActionResult> {
  // All Git mutations stay in the main process because the renderer should not
  // gain direct shell or filesystem power. The UI asks for a small, named
  // action, then this function translates that into the safest Git command for
  // the current status of the path.
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root) {
    return {
      ok: false,
      message: "Current workspace is not a Git repository.",
    };
  }

  const relativePath = getGitRelativePath(status.root, filePath);
  const change = status.changes.find(
    (candidate) => candidate.path === relativePath,
  );

  try {
    if (action === "stage") {
      // `git add` is intentionally scoped to one path. That keeps a button
      // click in Source Control from staging unrelated files the user has not
      // reviewed yet.
      await runGit(status.root, ["add", "--", relativePath]);
      return {
        ok: true,
        message: `Staged ${relativePath}.`,
      };
    }

    if (action === "unstage") {
      // `restore --staged` moves the path out of the index without touching
      // the working tree. That is the expected editor behavior: unstage should
      // not discard the user's actual file edits.
      await runGit(status.root, ["restore", "--staged", "--", relativePath]);
      return {
        ok: true,
        message: `Unstaged ${relativePath}.`,
      };
    }

    if (change?.indexState === "untracked") {
      // Untracked files do not have a HEAD version to restore from, so discard
      // must delete them. The renderer confirms before it calls this action;
      // this command still stays path-scoped so it cannot clean the whole repo.
      await runGit(status.root, ["clean", "-f", "--", relativePath]);
      return {
        ok: true,
        message: `Deleted untracked file ${relativePath}.`,
      };
    }

    // For tracked files, discard only resets the working tree copy. If the file
    // also has staged changes, those staged changes remain staged so a user can
    // throw away extra local edits without losing the reviewed index state.
    await runGit(status.root, ["restore", "--worktree", "--", relativePath]);
    return {
      ok: true,
      message: `Discarded unstaged changes in ${relativePath}.`,
    };
  } catch (err) {
    const message = `${(err as { stderr?: string }).stderr ?? ""}${(err as { message?: string }).message ?? ""}`.trim();
    return {
      ok: false,
      message: message || `Failed to ${action} ${relativePath}.`,
    };
  }
}

async function getGitWatchPaths(folderPath: string): Promise<string[]> {
  try {
    const gitDirResult = await runGit(folderPath, ["rev-parse", "--git-dir"]);
    const commonDirResult = await runGit(folderPath, [
      "rev-parse",
      "--git-common-dir",
    ]);
    const status = await getGitStatus(folderPath);
    const root = status.root ?? folderPath;

    const resolveGitPath = (value: string) =>
      path.isAbsolute(value) ? value : path.resolve(root, value);
    const gitDir = resolveGitPath(gitDirResult.stdout.trim());
    const commonDir = resolveGitPath(commonDirResult.stdout.trim());

    return [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "MERGE_HEAD"),
      path.join(gitDir, "CHERRY_PICK_HEAD"),
      path.join(gitDir, "REBASE_HEAD"),
      path.join(commonDir, "packed-refs"),
      path.join(commonDir, "refs"),
    ].filter((watchPath, index, allPaths) => {
      return fs.existsSync(watchPath) && allPaths.indexOf(watchPath) === index;
    });
  } catch {
    return [];
  }
}

function createDiagnosticId(diagnostic: Omit<EditorDiagnostic, "id">) {
  return `${diagnostic.source ?? "project"}:${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`;
}

function makeDiagnostic(
  diagnostic: Omit<EditorDiagnostic, "id">,
): EditorDiagnostic {
  return {
    ...diagnostic,
    id: createDiagnosticId(diagnostic),
  };
}

function parseTypeScriptDiagnostics(
  folderPath: string,
  output: string,
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  const diagnosticPattern =
    /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticPattern.exec(line.trim());
    if (!match) continue;

    const [, filePath, lineNumber, columnNumber, level, code, message] = match;
    diagnostics.push(
      makeDiagnostic({
        path: path.resolve(folderPath, filePath),
        line: Number(lineNumber),
        column: Number(columnNumber),
        severity: level === "warning" ? "warning" : "error",
        message,
        source: `tsc ${code}`,
      }),
    );
  }

  return diagnostics;
}

function parseGoDiagnostics(
  folderPath: string,
  output: string,
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];
  const diagnosticPattern = /^(.+?\.go):(\d+):(\d+):\s+(.+)$/;

  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticPattern.exec(line.trim());
    if (!match) continue;

    const [, filePath, lineNumber, columnNumber, message] = match;
    diagnostics.push(
      makeDiagnostic({
        path: path.resolve(folderPath, filePath),
        line: Number(lineNumber),
        column: Number(columnNumber),
        severity: "error",
        message,
        source: "go test",
      }),
    );
  }

  return diagnostics;
}

async function runProjectDiagnostics(
  folderPath: string,
): Promise<EditorDiagnostic[]> {
  const diagnostics: EditorDiagnostic[] = [];

  // This is the first project-aware diagnostics bridge. Monaco can only check
  // the model it has in memory, so imports, tsconfig options, and package-level
  // Go compile errors are easy to miss. These runners ask the project's own
  // toolchain for errors and keep the output normalized to the same Problems
  // panel shape that a long-lived LSP client can use later.
  if (fs.existsSync(path.join(folderPath, "tsconfig.json"))) {
    const workspaceTsc = path.join(
      folderPath,
      "node_modules/typescript/lib/tsc.js",
    );
    const bundledTsc = path.join(
      app.getAppPath(),
      "node_modules/typescript/lib/tsc.js",
    );
    const tscPath = fs.existsSync(workspaceTsc) ? workspaceTsc : bundledTsc;

    if (fs.existsSync(tscPath)) {
      try {
        await execFileAsync(
          "node",
          [tscPath, "--noEmit", "--pretty", "false"],
          {
            cwd: folderPath,
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 8,
          },
        );
      } catch (err) {
        const output = `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`;
        diagnostics.push(...parseTypeScriptDiagnostics(folderPath, output));
      }
    }
  }

  if (fs.existsSync(path.join(folderPath, "go.mod"))) {
    try {
      await execFileAsync("go", ["test", "-run", "^$", "./..."], {
        cwd: folderPath,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 8,
      });
    } catch (err) {
      const output = `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`;
      diagnostics.push(...parseGoDiagnostics(folderPath, output));
    }
  }

  return diagnostics;
}

function createWindow(options: { restoreSession?: boolean } = {}) {
  const axonIconPath = getAxonIconPath();
  const restoreSession = options.restoreSession !== false;

  app.setAboutPanelOptions({
    applicationName: "Axon",
    applicationVersion: app.getVersion(),
    copyright: "Axon",
    iconPath: axonIconPath,
  });

  if (isMac && app.dock) {
    app.dock.setIcon(axonIconPath);
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Axon",
    titleBarStyle: "hidden",
    backgroundColor: "#0f0f0f",
    icon: axonIconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
    },
  });
  windowSessionRestore.set(window.webContents.id, restoreSession);
  window.webContents.on("before-input-event", (event, input) => {
    if (!shouldBlockBrowserShortcut(input)) return;
    event.preventDefault();
  });

  if (isDev) {
    window.loadURL("http://localhost:5173");
  } else {
    window.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = window;
  }

  const webContentsId = window.webContents.id;
  window.on("closed", () => {
    // Electron destroys webContents as part of native window teardown. The
    // macOS menu-bar Quit path can reach this listener after the BrowserWindow
    // object is already half torn down, so reading `window.webContents.id` here
    // is unsafe and can throw "Object has been destroyed". Capturing the id
    // while the window is alive gives the cleanup path a stable key and keeps
    // native Quit from crashing the packaged app.
    windowSessionRestore.delete(webContentsId);
    if (mainWindow === window) {
      mainWindow = BrowserWindow.getAllWindows().find(
        (candidate) => !candidate.isDestroyed(),
      ) ?? null;
    }
  });

  return window;
}

function buildWatcherOptions() {
  return {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
    // macOS kqueue watchers are fast, but on a large workspace they can chew
    // through the process file-descriptor limit. Polling is less elegant, but
    // it keeps Axon stable under the repo sizes we actually run here.
    usePolling: shouldPollWatchers,
    interval: 250,
    binaryInterval: 400,
  };
}

function shouldIgnoreWorkspaceWatchPath(candidatePath: string) {
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
}

async function closeActiveWatcher() {
  if (!activeWatcher) return;
  await activeWatcher.close();
  activeWatcher = null;
}

async function closeFolderWatcher() {
  if (!folderWatcher) return;
  await folderWatcher.close();
  folderWatcher = null;
}

async function closeGitWatcher() {
  if (!gitWatcher) return;
  await gitWatcher.close();
  gitWatcher = null;
}

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("dialog:importFont", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Font files",
        extensions: ["ttf", "otf", "woff", "woff2"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return importCustomFontFile(result.filePaths[0]);
});

ipcMain.handle("settings:get", async (_event, folderPath?: string | null) => {
  const settings = readSettingsForFolder(folderPath);
  if (!folderPath || fs.existsSync(getWorkspaceSettingsPath(folderPath))) {
    writeSettingsToDisk(settings, getSettingsPath(folderPath));
  }
  return settings;
});

ipcMain.handle(
  "settings:update",
  async (_event, settings: AxonSettings, folderPath?: string | null) => {
    return writeSettingsToDisk(settings, getSettingsPath(folderPath));
  },
);

ipcMain.handle(
  "settings:ensureFile",
  async (_event, folderPath?: string | null, settings?: AxonSettings) => {
    return ensureSettingsFile(folderPath, settings);
  },
);

ipcMain.handle("app:getInfo", async () => {
  return {
    name: "Axon",
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
  };
});

ipcMain.handle("app:shouldRestoreSession", (event) => {
  return windowSessionRestore.get(event.sender.id) !== false;
});

ipcMain.handle("app:checkForUpdates", async () => {
  return checkForAppUpdate();
});

ipcMain.handle("app:getUpdateInstallState", async () => {
  return updateInstallState;
});

ipcMain.handle("app:downloadUpdate", async (): Promise<UpdateActionResult> => {
  if (isDev) {
    const message = "Packaged builds are required for in-app updates.";
    publishUpdateInstallState({ phase: "error", message });
    return { ok: false, message };
  }

  const macInstallBlocker = await getMacUpdateInstallBlocker();
  if (macInstallBlocker) {
    publishUpdateInstallState({ phase: "error", message: macInstallBlocker });
    return { ok: false, message: macInstallBlocker };
  }

  if (
    updateInstallState.phase === "checking" ||
    updateInstallState.phase === "downloading"
  ) {
    return { ok: true, message: "Update download is already running." };
  }
  if (updateInstallState.phase === "downloaded") {
    return { ok: true, message: "Update is ready to install." };
  }

  try {
    publishUpdateInstallState({ phase: "checking" });
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version;
    // `electron-updater` reads platform-specific metadata such as latest.yml
    // from the GitHub release. I still compare versions here before calling
    // downloadUpdate because a stale modal or a repeated click should not ask
    // the updater to download when the installed app is already current.
    if (!latestVersion || compareVersions(latestVersion, app.getVersion()) <= 0) {
      publishUpdateInstallState({
        phase: "not-available",
        version: latestVersion ?? app.getVersion(),
        message: "Axon is current.",
      });
      return { ok: false, message: "Axon is current." };
    }

    publishUpdateInstallState({
      phase: "downloading",
      version: latestVersion,
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      message: "Downloading update.",
    });
    // Let the IPC call resolve immediately so the renderer can show feedback
    // while electron-updater streams progress through the event listeners above.
    void autoUpdater.downloadUpdate().catch((err) => {
      const message =
        err instanceof Error ? err.message : "Failed to download update.";
      publishUpdateInstallState({ phase: "error", message });
    });
    return { ok: true, message: "Downloading update." };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to download update.";
    publishUpdateInstallState({ phase: "error", message });
    return { ok: false, message };
  }
});

ipcMain.handle("app:installUpdate", async (): Promise<UpdateActionResult> => {
  const macInstallBlocker = await getMacUpdateInstallBlocker();
  if (macInstallBlocker) {
    publishUpdateInstallState({ phase: "error", message: macInstallBlocker });
    return { ok: false, message: macInstallBlocker };
  }

  // Installation is intentionally gated on the downloaded state. Calling
  // quitAndInstall too early can close the editor without a ready installer,
  // which is the worst possible failure mode for an update button.
  if (updateInstallState.phase !== "downloaded") {
    return {
      ok: false,
      message: "Download the update before installing.",
    };
  }

  publishUpdateInstallState({
    ...updateInstallState,
    phase: "installing",
    message: "Restarting to install update.",
  });
  autoUpdater.autoInstallOnAppQuit = true;
  if (updateInstallTimeout) clearTimeout(updateInstallTimeout);

  // I schedule the actual restart after the IPC handler returns because the
  // renderer is waiting for this call to resolve before it can record the
  // action in Output. Calling quitAndInstall synchronously from inside the IPC
  // handler can leave the UI in an "Installing" state with no recovery if the
  // updater does not immediately close the app.
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to install update.";
      publishUpdateInstallState({ phase: "error", message });
    }
  }, 100);
  updateInstallTimeout = setTimeout(() => {
    if (updateInstallState.phase !== "installing") return;

    publishUpdateInstallState({
      phase: "downloaded",
      version: updateInstallState.version,
      message:
        "Axon could not restart automatically. Quit and reopen Axon to finish installing the downloaded update.",
    });
  }, 10000);

  return { ok: true, message: "Installing update." };
});

ipcMain.handle("app:openUpdatePage", async (_event, releaseUrl?: string) => {
  await shell.openExternal(normalizeUpdatePageUrl(releaseUrl));
});

ipcMain.handle(
  "htmlPreview:getTarget",
  async (
    _event,
    filePath: string,
    folderPath?: string | null,
  ): Promise<HtmlPreviewActionResult> => {
    try {
      const target = await getHtmlPreviewTarget(filePath, folderPath);
      return { ok: true, target };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : "Failed to start HTML preview.",
      };
    }
  },
);

ipcMain.handle(
  "htmlPreview:openExternal",
  async (
    _event,
    filePath: string,
    folderPath?: string | null,
  ): Promise<HtmlPreviewActionResult> => {
    try {
      const target = await getHtmlPreviewTarget(filePath, folderPath);
      await shell.openExternal(target.url);
      return { ok: true, target };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : "Failed to open HTML preview.",
      };
    }
  },
);

ipcMain.handle("clipboard:writeText", async (_event, text: string) => {
  clipboard.writeText(text);
});

ipcMain.handle("diagnostics:project", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  return runProjectDiagnostics(folderPath);
});

ipcMain.handle("lsp:status", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  return getLanguageServerStatus(folderPath);
});

ipcMain.handle("lsp:start", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return {
      ok: false,
      message: "Open a workspace before starting language servers.",
      servers: [],
    } satisfies LanguageServerLifecycleResult;
  }

  return startRelevantLanguageServers(folderPath);
});

ipcMain.handle(
  "lsp:startForLanguage",
  async (
    _event,
    request: LanguageServerStartForFileRequest,
  ): Promise<LanguageServerLifecycleResult> => {
    if (!request.folderPath || !fs.existsSync(request.folderPath)) {
      return {
        ok: false,
        message: "Open a workspace before starting language servers.",
        servers: [],
      };
    }

    const settings = readSettingsForFolder(request.folderPath);
    if (!settings.lsp.enabled) {
      return {
        ok: true,
        message: "Language servers are disabled in settings.",
        servers: await getLanguageServerStatus(request.folderPath),
      };
    }

    return startLanguageServerForLanguage(
      request.folderPath,
      request.languageId,
    );
  },
);

ipcMain.handle("lsp:stop", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return {
      ok: false,
      message: "Open a workspace before stopping language servers.",
      servers: [],
    } satisfies LanguageServerLifecycleResult;
  }

  return stopRelevantLanguageServers(folderPath);
});

ipcMain.handle(
  "lsp:completion",
  async (
    _event,
    request: LanguageServerCompletionRequest,
  ): Promise<LanguageServerCompletionResult> => {
    if (!request.folderPath || !fs.existsSync(request.folderPath)) {
      return { ok: true, items: [] };
    }

    const settings = readSettingsForFolder(request.folderPath);
    if (!settings.lsp.enabled) {
      return { ok: true, items: [] };
    }

    return getLanguageServerCompletions(request);
  },
);

ipcMain.handle("git:status", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
      ignoredPaths: [],
    } satisfies GitStatusResult;
  }

  return getGitStatus(folderPath);
});

ipcMain.handle("tasks:list", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  return getWorkspaceTasks(folderPath);
});

ipcMain.handle(
  "tasks:run",
  async (_event, folderPath: string, taskId: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new Error("Open a workspace before running tasks.");
    }
    return startWorkspaceTask(folderPath, taskId);
  },
);

ipcMain.handle(
  "git:diff",
  async (
    _event,
    folderPath: string,
    filePath: string,
    staged = false,
    untracked = false,
  ) => {
    return getGitDiff(folderPath, filePath, staged, untracked);
  },
);

ipcMain.handle(
  "git:baseFile",
  async (_event, folderPath: string, filePath: string) => {
    if (!folderPath || !filePath || !fs.existsSync(folderPath)) return "";
    return getGitFileBase(folderPath, filePath);
  },
);

ipcMain.handle(
  "git:action",
  async (
    _event,
    folderPath: string,
    filePath: string,
    action: "stage" | "unstage" | "discard",
  ) => {
    if (!folderPath || !filePath || !fs.existsSync(folderPath)) {
      return {
        ok: false,
        message: "Open a Git workspace before running Git actions.",
      } satisfies GitActionResult;
    }

    return runGitAction(folderPath, filePath, action);
  },
);

// watch a file for external changes and notify the renderer when it changes.
// stops any previously active watcher first so we only ever watch one file.
// uses a small debounce delay to avoid multiple rapid fire events from
// editors that do atomic saves (write to temp then rename).
ipcMain.handle("fs:watch", async (_event, filePath: string) => {
  await closeActiveWatcher();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  activeWatcher = chokidar.watch(filePath, buildWatcherOptions());

  activeWatcher.on("change", () => {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const content = fs.readFileSync(filePath, "utf-8");
      // The file watcher can still fire during reload/close. Sending through
      // the shared renderer helper keeps external disk changes useful while
      // avoiding Electron's "Object has been destroyed" crash path.
      sendToRenderer("fs:fileChanged", {
        path: filePath,
        content,
      });
    }, 150);
  });
});

// stop watching when the renderer no longer needs it
ipcMain.handle("fs:unwatch", async () => {
  await closeActiveWatcher();
});

app.whenReady().then(async () => {
  // handle axon://local/absolute/path requests
  // streams the file directly to the renderer
  protocol.handle("axon", (request) => {
    const filePath = decodeURIComponent(
      request.url.replace("axon://local", ""),
    );
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  buildApplicationMenu();
  await startBundledAxonCore();
  createWindow({ restoreSession: true });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow({ restoreSession: true });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// watches the entire open folder for any changes (create, delete, rename)
// and notifies the renderer to refresh the file tree.
// debounced to avoid rapid fire events from bulk operations.

ipcMain.handle("fs:watchFolder", async (_event, folderPath: string) => {
  await closeFolderWatcher();
  await closeGitWatcher();
  stopAllLanguageServers();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let gitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  folderWatcher = chokidar.watch(folderPath, {
    ...buildWatcherOptions(),
    ignored: shouldIgnoreWorkspaceWatchPath,
    depth: 8,
  });

  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      sendToRenderer("fs:folderChanged");
    }, 300);
  };

  folderWatcher.on("add", notify);
  folderWatcher.on("change", notify);
  folderWatcher.on("unlink", notify);
  folderWatcher.on("addDir", notify);
  folderWatcher.on("unlinkDir", notify);

  const gitWatchPaths = await getGitWatchPaths(folderPath);
  if (gitWatchPaths.length > 0) {
    gitWatcher = chokidar.watch(gitWatchPaths, {
      ...buildWatcherOptions(),
      depth: 4,
    });

    const notifyGit = () => {
      if (gitDebounceTimer) clearTimeout(gitDebounceTimer);
      gitDebounceTimer = setTimeout(() => {
        sendToRenderer("git:changed");
      }, 250);
    };

    gitWatcher.on("add", notifyGit);
    gitWatcher.on("change", notifyGit);
    gitWatcher.on("unlink", notifyGit);
    gitWatcher.on("addDir", notifyGit);
    gitWatcher.on("unlinkDir", notifyGit);
  }
});

ipcMain.handle("fs:unwatchFolder", async () => {
  await closeFolderWatcher();
  await closeGitWatcher();
});

app.on("before-quit", async () => {
  stopActiveTasks();
  stopAllLanguageServers();
  stopBundledAxonCore();
  await closeActiveWatcher();
  await closeFolderWatcher();
  await closeGitWatcher();
  await closeHtmlPreviewServer();
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
