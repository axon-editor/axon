import { spawnSync } from "node:child_process";

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
  const result = spawnSync(
    "npm",
    ["--workspace", workspace, "run", "build"],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to build ${label}.`);
  }
}
