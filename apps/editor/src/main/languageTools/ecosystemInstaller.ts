import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";
import type { ManagedLanguageToolCatalogEntry } from "./catalog";

const MAX_PROCESS_OUTPUT = 128 * 1024;

function commandVariants(command: string) {
  if (process.platform !== "win32") return [command];
  return [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`];
}

export async function resolveRuntimeCommand(commands: string[]) {
  const env = await getDeveloperToolSpawnEnvironment();
  const searchDirectories = (env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);

  for (const command of commands) {
    if (path.isAbsolute(command)) {
      const exists = await fs.access(command).then(() => true).catch(() => false);
      if (exists) return { command, env };
      continue;
    }
    for (const directory of searchDirectories) {
      for (const variant of commandVariants(command)) {
        const candidate = path.join(directory, variant);
        const exists = await fs.access(candidate).then(() => true).catch(() => false);
        if (exists) return { command: candidate, env };
      }
    }
  }
  return null;
}

export function runManagedToolCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_PROCESS_OUTPUT);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = output.trim().split(/\r?\n/).slice(-8).join("\n");
      reject(
        new Error(
          `Tool installer exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.${detail ? `\n${detail}` : ""}`,
        ),
      );
    });
  });
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function quoteBatch(value: string) {
  if (/[\r\n%"]/u.test(value)) {
    throw new Error("The managed tool path cannot be represented safely on Windows.");
  }
  return `"${value}"`;
}

async function writeLauncher(options: {
  launcherPath: string;
  command: string;
  args: string[];
  environment?: Record<string, string>;
}) {
  await fs.mkdir(path.dirname(options.launcherPath), { recursive: true });
  if (process.platform === "win32") {
    const environment = Object.entries(options.environment ?? {})
      .map(([key, value]) => {
        if (/[%"\r\n]/u.test(key) || /[%"\r\n]/u.test(value)) {
          throw new Error("The managed tool environment is unsafe on Windows.");
        }
        return `set "${key}=${value}"`;
      })
      .join("\r\n");
    const command = [options.command, ...options.args].map(quoteBatch).join(" ");
    await fs.writeFile(
      options.launcherPath,
      `@echo off\r\n${environment ? `${environment}\r\n` : ""}${command} %*\r\n`,
      "utf8",
    );
    return;
  }
  const environment = Object.entries(options.environment ?? {})
    .map(([key, value]) => `${key}=${quoteShell(value)}`)
    .join(" ");
  const command = [options.command, ...options.args].map(quoteShell).join(" ");
  await fs.writeFile(
    options.launcherPath,
    `#!/usr/bin/env sh\nexec ${environment ? `env ${environment} ` : ""}${command} "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
}

function getLauncherPath(entry: ManagedLanguageToolCatalogEntry, stagingRoot: string) {
  return path.join(
    stagingRoot,
    "bin",
    process.platform === "win32" ? entry.windowsCommandName : entry.commandName,
  );
}

export async function installEcosystemTool(options: {
  entry: ManagedLanguageToolCatalogEntry;
  stagingRoot: string;
  finalToolRoot: string;
  signal: AbortSignal;
}) {
  const recipe = options.entry.ecosystemInstaller;
  if (!recipe) throw new Error("The language tool has no ecosystem installer.");
  const runtime = await resolveRuntimeCommand(recipe.runtimeCommands);
  if (!runtime) {
    throw new Error(
      `${options.entry.label} requires ${recipe.runtimeCommands.join(" or ")} before Axon can install its language server.`,
    );
  }
  const runtimeRoot = path.join(options.stagingRoot, "runtime");
  const finalRuntimeRoot = path.join(options.finalToolRoot, "runtime");
  await fs.mkdir(runtimeRoot, { recursive: true });
  const launcherPath = getLauncherPath(options.entry, options.stagingRoot);

  if (recipe.kind === "system-command") {
    await writeLauncher({ launcherPath, command: runtime.command, args: [] });
    return recipe.version;
  }

  if (recipe.kind === "python-venv") {
    const packageRoot = path.join(runtimeRoot, "site-packages");
    await runManagedToolCommand({
      command: runtime.command,
      args: [
        "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
        "--no-cache-dir", "--only-binary=:all:", "--target", packageRoot,
        `${recipe.packageName}==${recipe.version}`,
      ],
      cwd: runtimeRoot,
      env: runtime.env,
      signal: options.signal,
    });
    await writeLauncher({
      launcherPath,
      command: runtime.command,
      args: ["-m", "make_language_server"],
      environment: { PYTHONPATH: path.join(finalRuntimeRoot, "site-packages") },
    });
    return recipe.version;
  }

  if (recipe.kind === "ruby-gem") {
    const gemsRoot = path.join(runtimeRoot, "gems");
    const executablesRoot = path.join(runtimeRoot, "executables");
    await runManagedToolCommand({
      command: runtime.command,
      args: [
        "-S", "gem", "install", recipe.packageName, "--version", recipe.version,
        "--install-dir", gemsRoot, "--bindir", executablesRoot, "--no-document",
      ],
      cwd: runtimeRoot,
      env: runtime.env,
      signal: options.signal,
    });
    await writeLauncher({
      launcherPath,
      command: runtime.command,
      args: [path.join(finalRuntimeRoot, "executables", "ruby-lsp")],
      environment: {
        GEM_HOME: path.join(finalRuntimeRoot, "gems"),
        GEM_PATH: path.join(finalRuntimeRoot, "gems"),
      },
    });
    return recipe.version;
  }

  if (recipe.kind === "r-package") {
    const libraryRoot = path.join(runtimeRoot, "library");
    await fs.mkdir(libraryRoot, { recursive: true });
    const expression = [
      'lib <- Sys.getenv("AXON_R_LIBRARY")',
      `install.packages("${recipe.packageName}", lib=lib, repos="https://cloud.r-project.org", dependencies=NA)`,
      `stopifnot(as.character(packageVersion("${recipe.packageName}", lib.loc=lib)) == "${recipe.version}")`,
    ].join("; ");
    await runManagedToolCommand({
      command: runtime.command,
      args: ["--vanilla", "--slave", "-e", expression],
      cwd: runtimeRoot,
      env: { ...runtime.env, AXON_R_LIBRARY: libraryRoot },
      signal: options.signal,
    });
    await writeLauncher({
      launcherPath,
      command: runtime.command,
      args: ["--vanilla", "--slave", "-e", "languageserver::run()"],
      environment: { R_LIBS_USER: path.join(finalRuntimeRoot, "library") },
    });
    return recipe.version;
  }

  const outputPath = path.join(runtimeRoot, process.platform === "win32" ? "metals.bat" : "metals");
  await runManagedToolCommand({
    command: runtime.command,
    args: [
      "bootstrap", `${recipe.packageName}:${recipe.version}`, "-o", outputPath, "-f",
      "--java-opt", "-Xss4m", "--java-opt", "-Xms100m",
    ],
    cwd: runtimeRoot,
    env: { ...runtime.env, COURSIER_CACHE: path.join(runtimeRoot, "cache") },
    signal: options.signal,
  });
  if (process.platform !== "win32") await fs.chmod(outputPath, 0o755);
  await writeLauncher({
    launcherPath,
    command: path.join(finalRuntimeRoot, path.basename(outputPath)),
    args: [],
    environment: { COURSIER_CACHE: path.join(finalRuntimeRoot, "cache") },
  });
  return recipe.version;
}
