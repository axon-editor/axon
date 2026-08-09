import { execFile } from "child_process";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";
import { hasWorkspaceMarker } from "./workspaceMarkers";

export interface PythonEnvironmentSelection {
  virtualEnvPath: string;
  interpreterPath: string;
  importPaths?: string[];
}

export const PYTHON_WORKSPACE_MARKERS = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
  "uv.lock",
  "*.py",
  "*.pyi",
];

const execFileAsync = promisify(execFile);
const PYTHON_ENVIRONMENT_SCAN_DEPTH = 4;
const PYTHON_ENVIRONMENT_SCAN_LIMIT = 800;
const PYTHON_ENVIRONMENT_SCAN_CONCURRENCY = 32;
const PYTHON_ENVIRONMENT_CACHE_MS = 5000;
const PYTHON_RUNTIME_CACHE_MS = 30_000;
const PYTHON_RUNTIME_PROBE = `
import json
import site
import sys

print(json.dumps({
    "executable": sys.executable,
    "prefix": sys.prefix,
    "basePrefix": getattr(sys, "base_prefix", sys.prefix),
    "importPaths": [entry for entry in sys.path if isinstance(entry, str)],
    "sitePackages": site.getsitepackages() if hasattr(site, "getsitepackages") else [],
    "userSite": site.getusersitepackages() if site.ENABLE_USER_SITE else "",
}))
`.trim();
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
const runtimeProbeCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<PythonEnvironmentSelection>;
  }
>();

interface PythonRuntimeProbeResult {
  executable: string;
  prefix: string;
  basePrefix: string;
  importPaths: string[];
  sitePackages: string[];
  userSite: string;
}

export function parsePythonRuntimeProbe(
  output: string,
): PythonRuntimeProbeResult | null {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(
        lines[index],
      ) as Partial<PythonRuntimeProbeResult>;
      if (
        typeof value.executable !== "string" ||
        typeof value.prefix !== "string" ||
        typeof value.basePrefix !== "string"
      ) {
        continue;
      }
      return {
        executable: value.executable,
        prefix: value.prefix,
        basePrefix: value.basePrefix,
        importPaths: Array.isArray(value.importPaths)
          ? value.importPaths.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        sitePackages: Array.isArray(value.sitePackages)
          ? value.sitePackages.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        userSite: typeof value.userSite === "string" ? value.userSite : "",
      };
    } catch {
      // Python launchers and environment managers can print notices before the
      // probe result. Walking backward lets the final JSON payload remain the
      // contract without treating harmless launcher output as a failed runtime.
    }
  }
  return null;
}

function uniqueExistingPythonPaths(paths: string[]) {
  return Array.from(
    new Set(
      paths
        .filter((candidate) => path.isAbsolute(candidate))
        .map((candidate) => path.resolve(candidate))
        .filter((candidate) => {
          try {
            return fs.statSync(candidate).isDirectory();
          } catch {
            return false;
          }
        }),
    ),
  );
}

export async function resolvePythonEnvironmentSelection(
  selection: PythonEnvironmentSelection,
  folderPath: string,
  environment?: NodeJS.ProcessEnv,
  probeRuntime?: () => Promise<string>,
): Promise<PythonEnvironmentSelection> {
  if (!selection.interpreterPath) return selection;

  const cacheKey = path.resolve(selection.interpreterPath);
  const cached = runtimeProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    try {
      const stdout = probeRuntime
        ? await probeRuntime()
        : (
            await execFileAsync(
              selection.interpreterPath,
              ["-c", PYTHON_RUNTIME_PROBE],
              {
                cwd: folderPath || path.dirname(selection.interpreterPath),
                env: environment ?? (await getDeveloperToolSpawnEnvironment()),
                encoding: "utf8",
                maxBuffer: 128 * 1024,
                timeout: 3000,
              },
            )
          ).stdout;
      const runtime = parsePythonRuntimeProbe(stdout);
      if (!runtime) return selection;

      const interpreterPath =
        runtime.executable && fs.existsSync(runtime.executable)
          ? path.resolve(runtime.executable)
          : path.resolve(selection.interpreterPath);
      const runtimeIsVirtualEnvironment =
        runtime.prefix &&
        runtime.basePrefix &&
        path.resolve(runtime.prefix) !== path.resolve(runtime.basePrefix);
      const virtualEnvPath =
        runtime.prefix &&
        (runtimeIsVirtualEnvironment || Boolean(selection.virtualEnvPath))
          ? path.resolve(runtime.prefix)
          : "";

      // Pyright normally derives package roots from the interpreter. I also
      // pass the interpreter's real package/search entries because editable
      // installs, Conda, Poetry, uv, and .pth files can add paths that directory
      // naming alone cannot predict. Standard-library roots stay under the base
      // prefix and are omitted so Pyright continues using its bundled typeshed.
      const basePrefix = runtime.basePrefix
        ? path.resolve(runtime.basePrefix)
        : "";
      const importPaths = uniqueExistingPythonPaths([
        ...runtime.sitePackages,
        ...(runtime.userSite ? [runtime.userSite] : []),
        ...runtime.importPaths.filter((candidate) => {
          if (!path.isAbsolute(candidate)) return false;
          const resolvedCandidate = path.resolve(candidate);
          const packageDirectory =
            /(?:^|[\\/])(?:site|dist)-packages(?:[\\/]|$)/.test(
              resolvedCandidate,
            );
          return (
            packageDirectory ||
            !basePrefix ||
            (resolvedCandidate !== basePrefix &&
              !resolvedCandidate.startsWith(`${basePrefix}${path.sep}`))
          );
        }),
      ]);

      return { virtualEnvPath, interpreterPath, importPaths };
    } catch {
      // A selected interpreter can disappear while an environment is being
      // rebuilt. Falling back to the validated path preserves Python support;
      // the short cache expires and a later settings/LSP request probes again.
      return selection;
    }
  })();

  runtimeProbeCache.set(cacheKey, {
    expiresAt: Date.now() + PYTHON_RUNTIME_CACHE_MS,
    promise,
  });
  return promise;
}

export function isPythonWorkspace(folderPath: string) {
  return (
    Boolean(folderPath) &&
    hasWorkspaceMarker(folderPath, PYTHON_WORKSPACE_MARKERS)
  );
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
  const environment = await getDeveloperToolSpawnEnvironment();
  const managedEnvironment = workspaceEnvironment
    ? null
    : await detectManagedPythonEnvironment(folderPath, environment);
  const selection = workspaceEnvironment ??
    managedEnvironment ??
    detectActivePythonEnvironment(environment) ??
    detectSystemPython(environment) ?? {
      virtualEnvPath: "",
      interpreterPath: "",
    };

  return resolvePythonEnvironmentSelection(selection, folderPath, environment);
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
