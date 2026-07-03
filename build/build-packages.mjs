import { spawnSync } from "node:child_process";
import { summarizeSpawnFailure } from "./build-diagnostics.mjs";

const npmExecPath = process.env.npm_execpath;

const packageBuilds = [
  ["@axon/extension-api", "extension API"],
  ["@axon/protocol", "shared protocol"],
  ["@axon/ipc", "shared IPC channels"],
  ["@axon/config", "shared config"],
];

for (const [workspace, label] of packageBuilds) {
  // The root build step owns package orchestration because these packages are
  // consumed by both Electron and future extension tooling. Keeping the order
  // here avoids hiding cross-package dependencies inside the editor app, which
  // is exactly what the repository split is meant to prevent.
  //
  // I run npm through Node's current executable instead of spawning `npm` or
  // `npm.cmd` directly. Windows CI can reject command-shim spawning with EINVAL,
  // while npm exposes its real JS entrypoint through npm_execpath whenever this
  // script is launched from an npm lifecycle. Falling back to `npm` keeps direct
  // local execution useful, but release builds take the shim-free path.
  const command = npmExecPath ? process.execPath : "npm";
  const args = npmExecPath
    ? [npmExecPath, "--workspace", workspace, "run", "build"]
    : ["--workspace", workspace, "run", "build"];
  const result = spawnSync(
    command,
    args,
    { stdio: "inherit" },
  );

  if (result.error) {
    summarizeSpawnFailure({ label, result });
    throw result.error;
  }

  if (result.status !== 0) {
    summarizeSpawnFailure({ label, result });
    throw new Error(`Failed to build ${label}.`);
  }
}
