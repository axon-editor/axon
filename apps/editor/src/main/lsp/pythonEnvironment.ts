import { execFile } from "child_process";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";

export interface PythonEnvironmentSelection {
  virtualEnvPath: string;
  interpreterPath: string;
}

const execFileAsync = promisify(execFile);
const PYTHON_ENVIRONMENT_SCAN_DEPTH = 4;
const PYTHON_ENVIRONMENT_SCAN_LIMIT = 800;
const PYTHON_ENVIRONMENT_SCAN_CONCURRENCY = 32;
const PYTHON_ENVIRONMENT_CACHE_MS = 5000;
const ignoredPythonEnvironmentDirectories = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".terraform",
  ".turbo",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);
const detectionCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<PythonEnvironmentSelection>;
  }
>();

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

async function hasPythonEnvironmentMarker(candidatePath: string) {
  return fsPromises
    .stat(path.join(candidatePath, "pyvenv.cfg"))
    .then((info) => info.isFile())
    .catch(() => false);
}

// findPythonVirtualEnvInWorkspace searches by Python's environment marker, not
// by conventional directory names. Breadth-first traversal prefers the closest
// project environment and the depth/directory caps prevent a malformed or very
// large workspace from turning interpreter discovery into an unbounded walk.
export async function findPythonVirtualEnvInWorkspace(
  folderPath: string,
): Promise<PythonEnvironmentSelection | null> {
  if (!folderPath) return null;

  const pending = [
    { directory: path.resolve(folderPath), depth: 0, descend: true },
  ];
  let scannedDirectories = 0;
  while (
    pending.length > 0 &&
    scannedDirectories < PYTHON_ENVIRONMENT_SCAN_LIMIT
  ) {
    const batch = pending.splice(0, PYTHON_ENVIRONMENT_SCAN_CONCURRENCY);
    scannedDirectories += batch.length;
    const results = await Promise.all(
      batch.map(async ({ directory, depth, descend }) => {
        if (await hasPythonEnvironmentMarker(directory)) {
          const interpreterPath = getPythonInterpreterFromVirtualEnv(directory);
          if (interpreterPath) {
            return {
              selection: { virtualEnvPath: directory, interpreterPath },
              children: [] as Array<{
                directory: string;
                depth: number;
                descend: boolean;
              }>,
            };
          }
        }

        if (!descend || depth >= PYTHON_ENVIRONMENT_SCAN_DEPTH) {
          return { selection: null, children: [] };
        }
        const entries = await fsPromises
          .readdir(directory, { withFileTypes: true })
          .catch(() => []);
        const children = entries
          .filter((entry) => entry.isDirectory())
          .sort(
            (left, right) =>
              environmentNamePriority(left.name) -
              environmentNamePriority(right.name),
          )
          .map((entry) => ({
            directory: path.join(directory, entry.name),
            depth: depth + 1,
            // Even normally ignored folders are checked once for pyvenv.cfg
            // because Python permits any environment name. Their descendants
            // remain excluded unless that root proves to be an environment.
            descend: !ignoredPythonEnvironmentDirectories.has(
              entry.name.toLowerCase(),
            ),
          }));
        return { selection: null, children };
      }),
    );

    const selection = results.find((result) => result.selection)?.selection;
    if (selection) return selection;
    for (const result of results) pending.push(...result.children);
  }

  return null;
}

function environmentNamePriority(name: string) {
  const normalizedName = name.toLowerCase();
  const preferredNames = [".venv", "venv", "env", ".env", "virtualenv"];
  const preferredIndex = preferredNames.indexOf(normalizedName);
  return preferredIndex < 0 ? preferredNames.length : preferredIndex;
}

async function runInterpreterProbe(
  command: string,
  args: string[],
  folderPath: string,
  environment: NodeJS.ProcessEnv,
) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: folderPath,
      env: environment,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: 2000,
    });
    const outputLines = stdout.trim().split(/\r?\n/).filter(Boolean);
    return outputLines[outputLines.length - 1] ?? "";
  } catch {
    return "";
  }
}

async function detectManagedPythonEnvironment(
  folderPath: string,
  environment: NodeJS.ProcessEnv,
): Promise<PythonEnvironmentSelection | null> {
  const virtualEnvironmentProbes: Array<{
    marker: string;
    command: string;
    args: string[];
  }> = [
    {
      marker: "poetry.lock",
      command: "poetry",
      args: ["env", "info", "--path"],
    },
    { marker: "Pipfile", command: "pipenv", args: ["--venv"] },
  ];
  for (const probe of virtualEnvironmentProbes) {
    if (!fs.existsSync(path.join(folderPath, probe.marker))) continue;
    const virtualEnvPath = await runInterpreterProbe(
      probe.command,
      probe.args,
      folderPath,
      environment,
    );
    const interpreterPath = getPythonInterpreterFromVirtualEnv(virtualEnvPath);
    if (interpreterPath) return { virtualEnvPath, interpreterPath };
  }

  const interpreterProbes: Array<{
    marker: string;
    command: string;
    args: string[];
  }> = [
    { marker: ".python-version", command: "pyenv", args: ["which", "python"] },
    { marker: "uv.lock", command: "uv", args: ["python", "find"] },
  ];
  for (const probe of interpreterProbes) {
    if (!fs.existsSync(path.join(folderPath, probe.marker))) continue;
    const interpreterPath = await runInterpreterProbe(
      probe.command,
      probe.args,
      folderPath,
      environment,
    );
    if (interpreterPath && fs.existsSync(interpreterPath)) {
      return { virtualEnvPath: "", interpreterPath };
    }
  }

  return null;
}

function detectActivePythonEnvironment(environment: NodeJS.ProcessEnv) {
  for (const candidate of [environment.VIRTUAL_ENV, environment.CONDA_PREFIX]) {
    if (!candidate) continue;
    const interpreterPath = getPythonInterpreterFromVirtualEnv(candidate);
    if (interpreterPath) {
      return { virtualEnvPath: candidate, interpreterPath };
    }
  }
  return null;
}

function detectSystemPython(environment: NodeJS.ProcessEnv) {
  const pathEntries = (environment.PATH ?? environment.Path ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  const executableNames =
    process.platform === "win32"
      ? ["python.exe", "python3.exe", "python.cmd"]
      : ["python3", "python"];
  for (const directory of pathEntries) {
    for (const executableName of executableNames) {
      const interpreterPath = path.join(directory, executableName);
      if (fs.existsSync(interpreterPath)) {
        return { virtualEnvPath: "", interpreterPath };
      }
    }
  }
  return null;
}

async function detectPythonEnvironment(
  folderPath: string,
): Promise<PythonEnvironmentSelection> {
  const workspaceEnvironment =
    await findPythonVirtualEnvInWorkspace(folderPath);
  if (workspaceEnvironment) return workspaceEnvironment;

  const environment = await getDeveloperToolSpawnEnvironment();
  const managedEnvironment = await detectManagedPythonEnvironment(
    folderPath,
    environment,
  );
  if (managedEnvironment) return managedEnvironment;

  return (
    detectActivePythonEnvironment(environment) ??
    detectSystemPython(environment) ?? {
      virtualEnvPath: "",
      interpreterPath: "",
    }
  );
}

export function detectPythonVirtualEnvForWorkspace(folderPath: string) {
  if (!folderPath) {
    return Promise.resolve({ virtualEnvPath: "", interpreterPath: "" });
  }

  const workspacePath = path.resolve(folderPath);
  const cached = detectionCache.get(workspacePath);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = detectPythonEnvironment(workspacePath).catch(() => ({
    virtualEnvPath: "",
    interpreterPath: "",
  }));
  detectionCache.set(workspacePath, {
    expiresAt: Date.now() + PYTHON_ENVIRONMENT_CACHE_MS,
    promise,
  });
  return promise;
}
