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
import { execFile } from "child_process";
import { promisify } from "util";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
} from "../shared/settings";
import { AXON_COMMANDS, type AxonCommand } from "../shared/commands";
import { type EditorDiagnostic } from "../shared/diagnostics";
import {
  type GitChange,
  type GitDiffResult,
  type GitFileState,
  type GitStatusResult,
} from "../shared/git";

const isDev = process.env.NODE_ENV === "development";
app.setName("Axon");
const execFileAsync = promisify(execFile);

const isMac = process.platform === "darwin";
let mainWindow: BrowserWindow | null = null;

function sendMenuCommand(command: AxonCommand) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  targetWindow?.webContents.send("menu:command", command);
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
      // push the new content to the renderer via webContents.send
      mainWindow?.webContents.send("fs:fileChanged", {
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

app.whenReady().then(() => {
  // handle axon://local/absolute/path requests
  // streams the file directly to the renderer
  protocol.handle("axon", (request) => {
    const filePath = decodeURIComponent(
      request.url.replace("axon://local", ""),
    );
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  buildApplicationMenu();
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
      mainWindow?.webContents.send("fs:folderChanged");
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
        mainWindow?.webContents.send("git:changed");
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
