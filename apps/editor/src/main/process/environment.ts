import { execFile } from "child_process";
import os from "os";
import path from "path";

let loginShellEnvironmentPromise: Promise<NodeJS.ProcessEnv> | null = null;

function parseEnvironmentOutput(output: string) {
  const parsed: NodeJS.ProcessEnv = {};

  for (const line of output.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (key) parsed[key] = value;
  }

  return parsed;
}

function mergePathValues(...values: Array<string | undefined>) {
  const entries = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const entry of value.split(path.delimiter)) {
      const trimmed = entry.trim();
      if (trimmed) entries.add(trimmed);
    }
  }

  return Array.from(entries).join(path.delimiter);
}

function getLoginShellEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== "darwin") {
    return Promise.resolve({} satisfies NodeJS.ProcessEnv);
  }

  if (loginShellEnvironmentPromise) return loginShellEnvironmentPromise;

  loginShellEnvironmentPromise = new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    const homePath = process.env.HOME ?? os.homedir();
    execFile(
      shell,
      ["-ilc", "/usr/bin/env"],
      {
        env: {
          ...process.env,
          HOME: homePath,
          TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
        },
        maxBuffer: 256 * 1024,
        timeout: 3_000,
      },
      (err, stdout) => {
        resolve(err ? {} : parseEnvironmentOutput(stdout));
      },
    );
  });

  return loginShellEnvironmentPromise;
}

export async function getDeveloperToolSpawnEnvironment(
  env: NodeJS.ProcessEnv | undefined = process.env,
) {
  const loginShellEnvironment = await getLoginShellEnvironment();
  const homePath = env?.HOME ?? loginShellEnvironment.HOME ?? os.homedir();
  const fallbackPath =
    process.platform === "win32"
      ? undefined
      : [
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          "/usr/local/sbin",
          path.join(homePath, ".local", "bin"),
          path.join(homePath, ".cargo", "bin"),
          path.join(homePath, "go", "bin"),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter);

  // Finder and Dock launches do not inherit the PATH configured by nvm,
  // Homebrew, pyenv, rustup, or the user's shell profile. I recover that
  // environment once and merge it with Electron's current environment so
  // every developer tool launched by Axon sees the same installations that
  // work in Terminal. The cached promise keeps this correction off the hot
  // path after the first tool launch.
  return {
    ...loginShellEnvironment,
    ...env,
    HOME: homePath,
    PATH: mergePathValues(
      loginShellEnvironment.PATH,
      env?.PATH ?? env?.Path,
      fallbackPath,
    ),
    TMPDIR: env?.TMPDIR ?? loginShellEnvironment.TMPDIR ?? os.tmpdir(),
  };
}
