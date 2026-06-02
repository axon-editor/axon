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
import http from "http";
import { promisify } from "util";
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
  type LanguageServerId,
  type LanguageServerLifecycleResult,
  type LanguageServerStatus,
} from "../shared/lsp";

const isDev = process.env.NODE_ENV === "development";
app.setName("Axon");
const execFileAsync = promisify(execFile);

const isMac = process.platform === "darwin";
let mainWindow: BrowserWindow | null = null;
let bundledCoreProcess: ChildProcess | null = null;
const activeTasks = new Map<string, ChildProcessWithoutNullStreams>();
const activeLanguageServers = new Map<string, LanguageServerSession>();
const axonCorePort = process.env.AXON_CORE_PORT ?? "7777";

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

function closeFocusedWindow() {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  targetWindow?.close();
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
          click: () => createWindow(),
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
    { role: "viewMenu" },
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
    const devIcon = path.join(app.getAppPath(), "src/renderer/public/axon.png");
    if (fs.existsSync(devIcon)) return devIcon;
  }

  const builtIcon = path.join(__dirname, "../renderer/axon.png");
  if (fs.existsSync(builtIcon)) return builtIcon;

  return path.join(app.getAppPath(), "src/renderer/public/axon.png");
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

      if (fs.existsSync(workspaceServer)) {
        return {
          command: workspaceServer,
          args: ["--version"],
          launchCommand: workspaceServer,
          launchArgs: ["--stdio"],
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
      startable: true,
    }
  );
}

async function canRunCommand(command: string, args: string[]) {
  if (path.isAbsolute(command) && fs.existsSync(command) && args.length === 0) {
    return true;
  }

  try {
    await execFileAsync(command, args, {
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

function initializeLanguageServer(session: LanguageServerSession) {
  session.requestId += 1;

  // This is a minimal LSP handshake, not the full client. The important part
  // for this slice is proving Axon can own the server process and negotiate a
  // workspace root from the main process. Diagnostics, document sync, and
  // definition requests can now build on this session instead of inventing a
  // separate process lifecycle later.
  writeLanguageServerMessage(session, {
    jsonrpc: "2.0",
    id: session.requestId,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: url.pathToFileURL(session.folderPath).toString(),
      workspaceFolders: [
        {
          uri: url.pathToFileURL(session.folderPath).toString(),
          name: path.basename(session.folderPath),
        },
      ],
      capabilities: {},
    },
  });

  writeLanguageServerMessage(session, {
    jsonrpc: "2.0",
    method: "initialized",
    params: {},
  });
  session.initialized = true;
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

    const resolved = resolveLanguageServerCommand(definition, folderPath);
    const key = getLanguageServerSessionKey(folderPath, definition.id);

    try {
      const child = spawn(resolved.launchCommand, resolved.launchArgs, {
        cwd: folderPath,
        stdio: "pipe",
      });
      const session: LanguageServerSession = {
        id: definition.id,
        folderPath,
        process: child,
        requestId: 0,
        initialized: false,
        stderr: "",
      };

      await waitForLanguageServerSpawn(child, definition.label);
      activeLanguageServers.set(key, session);

      child.stderr.on("data", (chunk) => {
        session.stderr = `${session.stderr}${chunk.toString()}`.slice(-4000);
      });
      child.on("exit", () => {
        activeLanguageServers.delete(key);
      });
      child.on("error", () => {
        activeLanguageServers.delete(key);
      });

      initializeLanguageServer(session);
      attempts.push({
        label: definition.label,
        ok: true,
        message: `${definition.label} started.`,
      });
    } catch (err) {
      activeLanguageServers.delete(key);
      attempts.push({
        label: definition.label,
        ok: false,
        message: `${definition.label}: ${(err as Error).message}`,
      });
    }
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

async function getGitStatus(folderPath: string): Promise<GitStatusResult> {
  try {
    const rootResult = await runGit(folderPath, ["rev-parse", "--show-toplevel"]);
    const root = rootResult.stdout.trim();
    const branchResult = await runGit(folderPath, [
      "branch",
      "--show-current",
    ]);
    const statusResult = await runGit(folderPath, ["status", "--porcelain=v1"]);

    return {
      isRepository: true,
      root,
      branch: branchResult.stdout.trim() || "detached",
      changes: parseGitStatus(root, statusResult.stdout),
    };
  } catch {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
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

function createWindow() {
  const axonIconPath = getAxonIconPath();

  app.setAboutPanelOptions({
    applicationName: "Axon",
    applicationVersion: app.getVersion(),
    copyright: "Axon",
    iconPath: axonIconPath,
  });

  if (isMac && app.dock) {
    app.dock.setIcon(axonIconPath);
  }

  mainWindow = new BrowserWindow({
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

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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

ipcMain.handle("git:status", async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
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
  createWindow();
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
    // ignore hidden files, node_modules, vendor, dist
    ignored: /(^|[\/\\])(\.|node_modules|vendor|dist)/,
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
