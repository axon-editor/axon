import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import url from "url";
import { type EditorDiagnostic } from "../../shared/diagnostics";
import {
  type LanguageServerDocumentSyncRequest,
  type LanguageServerId,
} from "../../shared/lsp";
import { readSettingsForFolder } from "../settings/io";
import { getWorkspaceSettingsPath } from "../settings/paths";
import {
  LANGUAGE_SERVER_DEFINITIONS,
  type LanguageServerDefinition,
  type ResolvedLanguageServerCommand,
  type LanguageServerStartAttempt,
} from "./definitions";
import { getBundledAppFilePath, resolveBundledAppFilePath } from "./paths";

export interface LanguageServerSession {
  id: LanguageServerId;
  folderPath: string;
  process: ChildProcessWithoutNullStreams;
  requestId: number;
  initialized: boolean;
  disposed: boolean;
  initializeRetryCount: number;
  initializeRetryTimer: ReturnType<typeof setTimeout> | null;
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

export interface LspSessionDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

const WORKSPACE_MARKER_SEARCH_DEPTH = 4;
const WORKSPACE_MARKER_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gocache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "__pycache__",
]);
const resolvedCommandPathCache = new Map<string, string>();
const commandAvailabilityCache = new Map<string, boolean>();

function directoryHasFileWithExtension(
  folderPath: string,
  extension: string,
  depth = 0,
): boolean {
  if (depth > WORKSPACE_MARKER_SEARCH_DEPTH) return false;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension)) return true;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (WORKSPACE_MARKER_IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;

    // The Settings LSP panel is refreshed often, so I keep this scan shallow
    // and skip generated dependency folders. That still catches real project
    // signals such as a .py file under src/, without turning every settings
    // refresh into a full workspace search across node_modules, build outputs,
    // or caches.
    if (
      directoryHasFileWithExtension(
        path.join(folderPath, entry.name),
        extension,
        depth + 1,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function hasWorkspaceMarker(folderPath: string, markers: string[]) {
  return markers.some((marker) => {
    if (!marker.includes("*")) {
      return fs.existsSync(path.join(folderPath, marker));
    }

    // Some project markers are intentionally glob-shaped because their real
    // names are user-defined: C# projects use App.csproj/Solution.sln instead
    // of a fixed filename. I only support a simple "*.<ext>" marker here so
    // relevance checks stay cheap and predictable during settings refresh.
    const extension = marker.startsWith("*.") ? marker.slice(1) : "";
    if (!extension) return false;

    return directoryHasFileWithExtension(folderPath, extension);
  });
}

export function getLanguageServerSessionKey(
  folderPath: string,
  id: LanguageServerId,
) {
  return `${path.resolve(folderPath)}::${id}`;
}

export function getElectronNodeEnvironment() {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  };
}

export function getPythonInterpreterFromVirtualEnv(virtualEnvPath: string) {
  if (!virtualEnvPath) return "";

  const candidates =
    process.platform === "win32"
      ? [
          path.join(virtualEnvPath, "Scripts", "python.exe"),
          path.join(virtualEnvPath, "Scripts", "python"),
        ]
      : [
          path.join(virtualEnvPath, "bin", "python3"),
          path.join(virtualEnvPath, "bin", "python"),
        ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

export function detectPythonVirtualEnvForWorkspace(folderPath: string) {
  if (!folderPath) return { virtualEnvPath: "", interpreterPath: "" };

  const candidateNames = [".venv", "venv", "env", ".env", "virtualenv"];

  for (const candidateName of candidateNames) {
    const virtualEnvPath = path.join(folderPath, candidateName);
    const interpreterPath = getPythonInterpreterFromVirtualEnv(virtualEnvPath);
    if (interpreterPath) {
      return { virtualEnvPath, interpreterPath };
    }
  }

  return { virtualEnvPath: "", interpreterPath: "" };
}

export async function getPythonLanguageServerSettings(folderPath: string) {
  const settings = await readSettingsForFolder(folderPath);
  const hasWorkspaceSettings =
    Boolean(folderPath) && fs.existsSync(getWorkspaceSettingsPath(folderPath));
  const detectedVirtualEnv = detectPythonVirtualEnvForWorkspace(folderPath);
  const configuredInterpreterPath = hasWorkspaceSettings
    ? settings.lsp.pythonInterpreterPath
    : "";
  const configuredVirtualEnvPath = hasWorkspaceSettings
    ? settings.lsp.pythonVirtualEnvPath
    : "";
  const pythonPath =
    configuredInterpreterPath ||
    getPythonInterpreterFromVirtualEnv(configuredVirtualEnvPath) ||
    detectedVirtualEnv.interpreterPath;
  if (!pythonPath) return null;

  const virtualEnvPath =
    configuredVirtualEnvPath || detectedVirtualEnv.virtualEnvPath;
  const virtualEnvName = virtualEnvPath ? path.basename(virtualEnvPath) : "";
  const parentVirtualEnvPath = virtualEnvPath
    ? path.dirname(virtualEnvPath)
    : "";

  // Pyright accepts the same settings shape used by Python editor extensions:
  // python.pythonPath points at the interpreter, while python.venvPath and
  // python.venv let it understand the environment as a named venv. Sending
  // both keeps imports like Django/DRF resolvable even when the workspace does
  // not have a pyrightconfig.json yet.
  return {
    python: {
      pythonPath,
      defaultInterpreterPath: pythonPath,
      venvPath: parentVirtualEnvPath,
      venv: virtualEnvName,
      analysis: {
        autoSearchPaths: true,
        useLibraryCodeForTypes: true,
        diagnosticMode: "workspace",
      },
    },
  };
}

function resolveTypeScriptSdkPath(folderPath: string) {
  const candidateRoots = [
    folderPath,
    ...fs
      .readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(folderPath, entry.name)),
  ];

  for (const candidateRoot of candidateRoots) {
    const yarnTsdk = path.join(
      candidateRoot,
      ".yarn",
      "sdks",
      "typescript",
      "lib",
    );
    if (fs.existsSync(yarnTsdk)) return yarnTsdk;

    const workspaceTsdk = path.join(
      candidateRoot,
      "node_modules",
      "typescript",
      "lib",
    );
    if (fs.existsSync(workspaceTsdk)) return workspaceTsdk;
  }

  const bundledTsdk = resolveBundledAppFilePath(
    "node_modules",
    "typescript",
    "lib",
  );
  if (fs.existsSync(bundledTsdk)) return bundledTsdk;

  return null;
}

export async function getLanguageServerInitializationOptions(
  session: LanguageServerSession,
) {
  if (session.id === "typescript") {
    const tsserverPath = resolveTypeScriptSdkPath(session.folderPath);
    const bundledTsdk = resolveBundledAppFilePath(
      "node_modules",
      "typescript",
      "lib",
    );

    // typescript-language-server expects `tsserver.path` to point at either
    // the TypeScript `lib` directory or the `tsserver.js` file. Zed passes the
    // project SDK directory and lets tsserver discover the project from the
    // workspace root and file paths; doing the same here keeps Axon on the
    // documented path instead of depending on unsupported config-file options.
    return {
      hostInfo: "axon",
      provideFormatter: true,
      disableAutomaticTypingAcquisition: true,
      tsserver: {
        ...(tsserverPath ? { path: tsserverPath } : {}),
        ...(fs.existsSync(bundledTsdk) ? { fallbackPath: bundledTsdk } : {}),
        useSyntaxServer: "never",
      },
      preferences: getTypeScriptLanguageServerPreferences(),
    };
  }

  if (session.id !== "python") return undefined;
  const pythonSettings = await getPythonLanguageServerSettings(session.folderPath);
  if (!pythonSettings) return undefined;

  return {
    settings: pythonSettings,
  };
}

export function getTypeScriptLanguageServerPreferences() {
  return {
    // Axon should behave like VS Code/Zed for installed packages: if a package
    // is present in package.json/node_modules, exported symbols such as Lucide
    // icons or React components should appear as auto-import completions even
    // before the user has imported that module in the current file.
    includePackageJsonAutoImports: "on",
    includeCompletionsForModuleExports: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsWithInsertText: true,
    includeAutomaticOptionalChainCompletions: true,
    importModuleSpecifierPreference: "shortest",
  };
}

export function notifyLanguageServer(
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

export async function notifyLanguageServerConfiguration(
  session: LanguageServerSession,
  notifyLanguageServer: (
    session: LanguageServerSession,
    method: string,
    params: unknown,
  ) => void,
) {
  if (session.id === "typescript") {
    const tsdk = resolveTypeScriptSdkPath(session.folderPath);
    const preferences = getTypeScriptLanguageServerPreferences();

    // typescript-language-server asks for VS Code-shaped settings after the
    // initialized notification. Sending the SDK path here makes tsserver use
    // the workspace's TypeScript package when it exists, while the bundled SDK
    // remains the fallback for projects without local dependencies installed.
    notifyLanguageServer(session, "workspace/didChangeConfiguration", {
      settings: {
        typescript: {
          ...(tsdk ? { tsdk } : {}),
          preferences,
          implicitProjectConfiguration: {
            checkJs: false,
            module: "ESNext",
            strictNullChecks: true,
            strictFunctionTypes: true,
            target: "ES2020",
          },
          suggest: {
            includeCompletionsForModuleExports: true,
            includeCompletionsForImportStatements: true,
            includePackageJsonAutoImports: "on",
            autoImports: true,
          },
        },
        javascript: {
          ...(tsdk ? { tsdk } : {}),
          preferences,
          implicitProjectConfiguration: {
            checkJs: false,
            module: "ESNext",
            strictNullChecks: true,
            strictFunctionTypes: true,
            target: "ES2020",
          },
          suggest: {
            includeCompletionsForModuleExports: true,
            includeCompletionsForImportStatements: true,
            includePackageJsonAutoImports: "on",
            autoImports: true,
          },
        },
      },
    });
    return;
  }

  if (session.id !== "python") return;
  const pythonSettings = await getPythonLanguageServerSettings(session.folderPath);
  if (!pythonSettings) return;

  notifyLanguageServer(session, "workspace/didChangeConfiguration", {
    settings: pythonSettings,
  });
}

export function emitLanguageServerLog(
  session: Pick<LanguageServerSession, "id" | "folderPath">,
  level: "info" | "error",
  message: string,
) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return;

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (window.webContents.isDestroyed()) continue;
    try {
      window.webContents.send("lsp:log", {
        folderPath: session.folderPath,
        serverId: session.id,
        level,
        message: trimmedMessage.slice(-2000),
      });
    } catch {
      // LSP stderr often arrives while Axon is quitting or restarting after an
      // update. The log is useful when a renderer exists, but it should never
      // be able to resurrect the "Object has been destroyed" shutdown crash.
    }
  }
}

export function resolveBundledNodeLanguageServer(
  definition: LanguageServerDefinition,
): ResolvedLanguageServerCommand | null {
  if (!definition.bundledNodeServer) return null;

  const scriptSegments = [
    ...definition.bundledNodeServer.packagePath,
    ...definition.bundledNodeServer.scriptPath,
  ];
  const serverScript = getBundledAppFilePath(...scriptSegments);
  if (!fs.existsSync(serverScript)) return null;

  // npm-backed language servers are the easiest and safest servers for Axon to
  // bundle because their entry points are normal JavaScript files. Electron can
  // run those files in Node mode through the already-shipped app executable, so
  // users do not need a global node/npm install and every packaged Axon build
  // resolves the same server version.
  //
  // In packaged builds, unpacked resolution matters for Pyright. Pyright loads
  // sibling webpack chunks and type stub files at runtime; keeping it outside
  // app.asar avoids worker/module resolution differences between dev Electron
  // and the signed/unsigned app bundle.
  return {
    command: process.execPath,
    args: [serverScript, ...definition.args],
    launchCommand: process.execPath,
    launchArgs: [serverScript, ...definition.launchArgs],
    env: getElectronNodeEnvironment(),
    startable: true,
  };
}

export function getManagedLanguageServerPlatformKeys() {
  const architecture = process.arch;
  const platform = process.platform;

  return [`${platform}-${architecture}`, platform, "common"];
}

export function getManagedLanguageServerRoots() {
  // Packaged builds receive managed native/runtime-backed servers through
  // Electron's extraResources directory. Development builds use the same shape
  // under apps/editor/build/language-servers so the resolver can be tested locally
  // before release packaging.
  return [
    path.join(process.resourcesPath, "language-servers"),
    path.join(app.getAppPath(), "build", "language-servers"),
  ];
}

export function getExecutableNameVariants(executableName: string) {
  if (process.platform !== "win32") return [executableName];
  return [
    executableName,
    `${executableName}.exe`,
    `${executableName}.cmd`,
    `${executableName}.bat`,
  ];
}

export function resolveManagedLanguageServer(
  definition: LanguageServerDefinition,
): ResolvedLanguageServerCommand | null {
  if (!definition.managedBundle) return null;

  for (const root of getManagedLanguageServerRoots()) {
    for (const platformKey of getManagedLanguageServerPlatformKeys()) {
      for (const executableName of definition.managedBundle.executableNames) {
        for (const executableVariant of getExecutableNameVariants(
          executableName,
        )) {
          const executablePath = path.join(
            root,
            platformKey,
            definition.managedBundle.directoryName,
            "bin",
            executableVariant,
          );

          if (!fs.existsSync(executablePath)) continue;

          // Managed bundles are where Axon can ship native or runtime-backed
          // servers such as JDT LS, OmniSharp, Kotlin LS, and Lua LS without
          // asking each project to install them. The
          // platform segment prevents macOS/Linux/Windows binaries from being
          // mixed, while the common segment still supports portable launchers.
          //
          // I keep the parent process environment on managed servers because
          // Dock/Finder launches on macOS can give Electron a much smaller
          // environment than Terminal launches. The spawn site still adds
          // explicit HOME/PATH/TMPDIR fallbacks, but preserving process.env here
          // prevents native LSPs from losing any useful runtime variables Axon
          // already received.
          return {
            command: executablePath,
            args: definition.managedBundle.args ?? definition.args,
            launchCommand: executablePath,
            launchArgs:
              definition.managedBundle.launchArgs ?? definition.launchArgs,
            env: process.env,
            startable: true,
          };
        }
      }
    }
  }

  return null;
}

export function resolveLanguageServerCommand(
  definition: LanguageServerDefinition,
  folderPath: string,
): ResolvedLanguageServerCommand {
  const customResolved = definition.resolveCommand?.(folderPath);
  if (customResolved) return customResolved;

  return (
    resolveBundledNodeLanguageServer(definition) ??
    resolveManagedLanguageServer(definition) ?? {
      command: definition.command,
      args: definition.args,
      launchCommand: definition.command,
      launchArgs: definition.launchArgs,
      env: process.env,
      startable: true,
    }
  );
}

export function getExecutableSearchDirectories() {
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
      process.env.LOCALAPPDATA &&
        path.join(process.env.LOCALAPPDATA, "Programs"),
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].forEach((dir) => {
      if (dir) dirs.add(dir);
    });
  }

  return Array.from(dirs);
}

export function resolveCommandPath(command: string) {
  const cached = resolvedCommandPathCache.get(command);
  if (cached) return cached;

  if (path.isAbsolute(command) && fs.existsSync(command)) return command;

  const commandVariants =
    process.platform === "win32"
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command];

  for (const dir of getExecutableSearchDirectories()) {
    for (const candidate of commandVariants) {
      const resolved = path.join(dir, candidate);
      if (fs.existsSync(resolved)) {
        resolvedCommandPathCache.set(command, resolved);
        return resolved;
      }
    }
  }

  resolvedCommandPathCache.set(command, command);
  return command;
}

export async function canRunCommand(command: string, _args: string[]) {
  const resolvedCommand = resolveCommandPath(command);
  const cached = commandAvailabilityCache.get(resolvedCommand);
  if (cached !== undefined) return cached;
  // Settings refresh should be a read-only check. The previous implementation
  // executed `--version` for every language server, but the bundled TypeScript
  // server is launched through Electron's own binary in Node mode. Probing that
  // binary from a settings refresh can briefly create a native Electron window
  // before the process exits, which makes the LSP buttons look like they reload
  // Axon. Existence is enough here; the real start path still owns process
  // spawn errors and reports them as lifecycle messages.
  const available = path.isAbsolute(resolvedCommand) && fs.existsSync(resolvedCommand);
  commandAvailabilityCache.set(resolvedCommand, available);
  return available;
}

export function writeLanguageServerMessage(
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

export function rejectLanguageServerPendingRequests(
  session: LanguageServerSession,
  reason: Error,
) {
  for (const pending of session.pendingRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(reason);
  }
  session.pendingRequests.clear();
}

export function stopLanguageServerSession(
  key: string,
  activeLanguageServers: Map<string, LanguageServerSession>,
  stoppingLanguageServerKeys: Set<string>,
  deleteSessionFailure: (sessionKey: string) => void,
) {
  const session = activeLanguageServers.get(key);
  if (!session) return;
  stoppingLanguageServerKeys.add(key);
  deleteSessionFailure(key);

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

export function waitForLanguageServerSpawn(
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

export function readLanguageServerMessages(
  session: LanguageServerSession,
  chunk: Buffer,
  handleLanguageServerPayload: (
    session: LanguageServerSession,
    payload: unknown,
  ) => void,
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

    const body = session.stdoutBuffer
      .slice(bodyStart, bodyEnd)
      .toString("utf-8");
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

// ... additional LSP session helpers continue in the next slice.
