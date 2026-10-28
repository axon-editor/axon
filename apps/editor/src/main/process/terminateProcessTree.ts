/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcess } from "child_process";

const FORCE_KILL_DELAY_MS = 1500;

function hasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

// A shell command can start its own children, and killing only the shell leaves
// builds, test runners, and watchers alive. POSIX children are spawned detached
// so they lead their own process group and the negative pid reaches the whole
// tree. Windows has no process group equivalent here, so taskkill owns that
// path and falls back to child.kill when taskkill itself cannot start.
export function terminateProcessTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid) {
    child.kill();
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const fallback = () => {
      if (!hasExited(child)) child.kill();
    };
    killer.once("error", fallback);
    killer.once("close", (code) => {
      if (code !== 0) fallback();
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  const forceTimer = setTimeout(() => {
    if (hasExited(child)) return;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, FORCE_KILL_DELAY_MS);
  forceTimer.unref();
}
