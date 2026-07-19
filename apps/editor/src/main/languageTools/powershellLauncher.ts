import fs from "fs/promises";
import path from "path";

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function quoteBatch(value: string) {
  if (/[\r\n%"]/u.test(value)) {
    throw new Error("The PowerShell language-server path is unsafe on Windows.");
  }
  return `"${value}"`;
}

export async function writePowerShellEditorServicesLauncher(options: {
  launcherPath: string;
  scriptPath: string;
  runtimePath: string;
  toolRoot: string;
  version: string;
}) {
  const modulesRoot = path.dirname(path.dirname(options.scriptPath));
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-File",
    options.scriptPath,
    "-HostName",
    "Axon",
    "-HostProfileId",
    "Axon",
    "-HostVersion",
    options.version,
    "-BundledModulesPath",
    modulesRoot,
    "-LogPath",
    path.join(options.toolRoot, "logs", "editor-services.log"),
    "-LogLevel",
    "Normal",
    "-SessionDetailsPath",
    path.join(options.toolRoot, "session.json"),
    "-Stdio",
  ];
  await fs.mkdir(path.dirname(options.launcherPath), { recursive: true });
  await fs.mkdir(path.join(path.dirname(options.launcherPath), "..", "logs"), {
    recursive: true,
  });

  if (process.platform === "win32") {
    const command = [options.runtimePath, ...args].map(quoteBatch).join(" ");
    await fs.writeFile(options.launcherPath, `@echo off\r\n${command} %*\r\n`, "utf8");
    return;
  }
  const command = [options.runtimePath, ...args].map(quoteShell).join(" ");
  await fs.writeFile(
    options.launcherPath,
    `#!/usr/bin/env sh\nexec ${command} "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
}

export async function writeMetalsLauncher(options: {
  launcherPath: string;
  metalsPath: string;
  cacheRoot: string;
}) {
  await fs.mkdir(path.dirname(options.launcherPath), { recursive: true });
  if (process.platform === "win32") {
    if (/[%"\r\n]/u.test(options.cacheRoot)) {
      throw new Error("The Metals cache path is unsafe on Windows.");
    }
    await fs.writeFile(
      options.launcherPath,
      `@echo off\r\nset "COURSIER_CACHE=${options.cacheRoot}"\r\n${quoteBatch(options.metalsPath)} %*\r\n`,
      "utf8",
    );
    return;
  }
  await fs.writeFile(
    options.launcherPath,
    `#!/usr/bin/env sh\nexec env COURSIER_CACHE=${quoteShell(options.cacheRoot)} ${quoteShell(options.metalsPath)} "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
}
