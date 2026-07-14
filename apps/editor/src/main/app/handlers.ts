import { execFile } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from "electron";
import {
  type AgentResumeRequest,
  type CliToolInstallResult,
  type CliToolStatus,
} from "../../shared/app";
import {
  consumePendingAgentResumeRequest,
  writePendingAgentResumeRequest,
} from "./resumeRequest";
import { decodeSnapshotPng } from "./snapshotPng";

interface AppHandlerDependencies {
  windowSessionRestore: Map<number, boolean>;
  isExternalHandlerUrl: (href: string) => boolean;
  consumePendingCliOpenFolder: () => string | null;
  isDev: boolean;
}

const execFileAsync = promisify(execFile);
const cliTargetPath = "/usr/local/bin/axon";

function executableName(name: string) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function firstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Candidate probing is expected to fail in one of the two modes. A dev
      // checkout looks under apps/editor/build/core, while a packaged app looks in
      // Electron's resources directory. We only need the first executable hit.
    }
  }
  return candidates[0] ?? null;
}

async function resolveCliSourcePath(isDev: boolean) {
  const binaryName = executableName("axon");
  const candidates = isDev
    ? [
        path.join(app.getAppPath(), "build", "core", binaryName),
        path.join(process.cwd(), "build", "core", binaryName),
      ]
    : [path.join(process.resourcesPath, "core", binaryName)];

  return firstExistingPath(candidates);
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getCliToolStatus(isDev: boolean): Promise<CliToolStatus> {
  if (process.platform === "win32") {
    return {
      supported: false,
      installed: false,
      needsUpdate: false,
      sourceAvailable: false,
      targetPath: null,
      sourcePath: null,
      installCommand: null,
      message: "The axon command installer is not available on Windows yet.",
    };
  }

  const sourcePath = await resolveCliSourcePath(isDev);
  const sourceAvailable = sourcePath ? await fileExists(sourcePath) : false;
  const installed = await fileExists(cliTargetPath);
  let needsUpdate = false;

  if (installed && sourceAvailable && sourcePath) {
    try {
      needsUpdate =
        path.resolve(await fs.realpath(cliTargetPath)) !==
        path.resolve(await fs.realpath(sourcePath));
    } catch {
      needsUpdate = true;
    }
  }

  return {
    supported: true,
    installed,
    needsUpdate,
    sourceAvailable,
    targetPath: cliTargetPath,
    sourcePath,
    installCommand:
      sourcePath && sourceAvailable
        ? `sudo ln -sf ${shellQuote(sourcePath)} ${shellQuote(cliTargetPath)}`
        : null,
    message: sourceAvailable
      ? undefined
      : "Build the Axon CLI first so the app can install it.",
  };
}

async function installCliTool(isDev: boolean): Promise<CliToolInstallResult> {
  const status = await getCliToolStatus(isDev);
  if (!status.supported || !status.sourcePath || !status.sourceAvailable) {
    return {
      ok: false,
      status,
      message: status.message ?? "The axon command cannot be installed here.",
    };
  }

  const command = [
    "mkdir -p /usr/local/bin",
    `ln -sf ${shellQuote(status.sourcePath)} ${shellQuote(cliTargetPath)}`,
    `chmod 755 ${shellQuote(status.sourcePath)}`,
  ].join(" && ");

  try {
    if (process.platform === "darwin") {
      // `/usr/local/bin` is outside the app sandbox and may require admin
      // privileges on a user's machine. Running the install through AppleScript
      // gives macOS a normal password prompt instead of failing silently and
      // leaving `axon` unavailable in the shell.
      await execFileAsync("osascript", [
        "-e",
        `do shell script ${JSON.stringify(command)} with administrator privileges`,
      ]);
    } else {
      await fs.mkdir(path.dirname(cliTargetPath), { recursive: true });
      await fs.symlink(status.sourcePath, cliTargetPath);
      await fs.chmod(status.sourcePath, 0o755);
    }
  } catch (error) {
    const nextStatus = await getCliToolStatus(isDev);
    return {
      ok: false,
      status: nextStatus,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    status: await getCliToolStatus(isDev),
    message: "The axon command is installed.",
  };
}

export function registerAppHandlers({
  windowSessionRestore,
  isExternalHandlerUrl,
  consumePendingCliOpenFolder,
  isDev,
}: AppHandlerDependencies) {
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

  ipcMain.handle("app:consumeCliOpenFolder", () =>
    consumePendingCliOpenFolder(),
  );

  ipcMain.handle("app:openDevTools", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.webContents.isDestroyed()) return;
    window.webContents.openDevTools({ mode: "detach" });
  });

  ipcMain.handle("shell:openExternal", async (_event, href: string) => {
    if (!isExternalHandlerUrl(href)) {
      throw new Error(
        "Only external web, mail, and phone links can be opened.",
      );
    }

    await shell.openExternal(href);
  });

  ipcMain.handle("clipboard:writeText", async (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("clipboard:writeImage", async (_event, dataUrl: string) => {
    const image = nativeImage.createFromBuffer(decodeSnapshotPng(dataUrl));
    if (image.isEmpty()) throw new Error("The generated snapshot is empty.");
    clipboard.writeImage(image);
  });

  ipcMain.handle(
    "dialog:saveCodeSnapshot",
    async (_event, suggestedName: string, dataUrl: string) => {
      const safeName = path.basename(suggestedName || "code-snapshot.png");
      const defaultPath = safeName.toLowerCase().endsWith(".png")
        ? safeName
        : `${safeName}.png`;
      const result = await dialog.showSaveDialog({
        title: "Save Code Snapshot",
        defaultPath,
        filters: [{ name: "PNG image", extensions: ["png"] }],
      });
      if (result.canceled || !result.filePath) return null;

      // Export writes only bytes that passed the fixed PNG signature and size
      // checks above. The native dialog remains the authority for the target,
      // so the renderer never receives arbitrary filesystem write capability.
      await fs.writeFile(result.filePath, decodeSnapshotPng(dataUrl));
      return result.filePath;
    },
  );

  ipcMain.handle("app:getCliToolStatus", async () => getCliToolStatus(isDev));

  ipcMain.handle("app:installCliTool", async () => installCliTool(isDev));

  ipcMain.handle("app:getAgentResumeRequest", async () =>
    consumePendingAgentResumeRequest(),
  );

  ipcMain.handle(
    "app:saveAgentResumeRequest",
    async (_event, request: AgentResumeRequest) => {
      await writePendingAgentResumeRequest(request);
      return true;
    },
  );
}
