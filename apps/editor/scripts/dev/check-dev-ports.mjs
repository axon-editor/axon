/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// `npm run dev` starts three loopback servers. When a session dies without
// cleaning up, the port stays bound by an orphaned process and the raw
// `bind: address already in use` error says nothing about which process to
// stop. This preflight reclaims listeners whose parent process is gone, but
// never kills a port owned by a session that is still alive.

import { execFileSync } from "node:child_process";
import net from "node:net";

const DEV_PORTS = [
  { port: 17777, label: "Axon core" },
  { port: 17778, label: "Axon PTY host" },
  { port: 5173, label: "Vite dev server" },
];

const RECLAIM_WAIT_MS = 3_000;
const RECLAIM_POLL_MS = 150;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      resolve(error.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

function listenerPids(port) {
  try {
    if (process.platform === "win32") {
      const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
        encoding: "utf8",
      });
      const pattern = new RegExp(
        `^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
        "gim",
      );
      return [...output.matchAll(pattern)].map((match) => match[1]);
    }
    return execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function describeListener(pid) {
  try {
    if (process.platform === "win32") {
      return execFileSync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { encoding: "utf8" },
      ).trim();
    }
    return execFileSync("ps", ["-o", "command=", "-p", pid], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function parentPid(pid) {
  try {
    if (process.platform === "win32") {
      return Number(
        execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`,
          ],
          { encoding: "utf8" },
        ).trim(),
      );
    }
    return Number(
      execFileSync("ps", ["-o", "ppid=", "-p", pid], {
        encoding: "utf8",
      }).trim(),
    );
  } catch {
    return Number.NaN;
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error.code === "EPERM";
  }
}

function isOrphaned(pid) {
  const parent = parentPid(pid);
  if (!Number.isFinite(parent)) return false;
  // launchd/init is PID 1 on macOS and Linux. A Windows parent is checked by
  // existence instead because PID 1 has no special meaning there.
  if (process.platform !== "win32" && parent <= 1) return true;
  return !processExists(parent);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  if (process.platform === "win32") return;

  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return;
    await delay(RECLAIM_POLL_MS);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process exited between the check and the signal.
  }
}

async function waitForPort(port) {
  const deadline = Date.now() + RECLAIM_WAIT_MS;
  while (Date.now() < deadline) {
    if (!(await isPortInUse(port))) return true;
    await delay(RECLAIM_POLL_MS);
  }
  return !(await isPortInUse(port));
}

function printConflict(conflict) {
  console.error(`\n  ${conflict.label}, port ${conflict.port}`);
  if (conflict.pids.length === 0) {
    console.error("    Listener found, but its PID could not be resolved.");
    return;
  }
  for (const pid of conflict.pids) {
    const command = describeListener(pid);
    console.error(`    PID ${pid}${command ? `  ${command}` : ""}`);
  }
}

const conflicts = [];
for (const entry of DEV_PORTS) {
  if (await isPortInUse(entry.port)) {
    conflicts.push({ ...entry, pids: listenerPids(entry.port) });
  }
}

if (conflicts.length === 0) {
  console.log("Axon dev ports are available (17777, 17778, 5173).");
  process.exit(0);
}

const orphaned = [];
const active = [];
for (const conflict of conflicts) {
  const activeConflict = { ...conflict, pids: [] };
  for (const pid of conflict.pids) {
    if (isOrphaned(pid)) {
      orphaned.push({ port: conflict.port, label: conflict.label, pid });
    } else {
      activeConflict.pids.push(pid);
    }
  }
  if (activeConflict.pids.length > 0) active.push(activeConflict);
}

if (orphaned.length > 0) {
  console.log("Reclaiming listeners left by an earlier dev session:");
  for (const listener of orphaned) {
    console.log(
      `  ${listener.label}, port ${listener.port}: SIGTERM PID ${listener.pid}`,
    );
    await stopProcess(listener.pid);
  }
  for (const listener of orphaned) {
    await waitForPort(listener.port);
  }
  // Re-read each affected port because one reclaimed listener can expose
  // another process that was sharing the same port.
  const stillBusy = [];
  for (const entry of DEV_PORTS) {
    if (await isPortInUse(entry.port)) {
      stillBusy.push({ ...entry, pids: listenerPids(entry.port) });
    }
  }
  if (stillBusy.length === 0) {
    console.log("Axon dev ports are available (17777, 17778, 5173).");
    process.exit(0);
  }
  active.length = 0;
  active.push(...stillBusy);
}

console.error("Axon dev cannot start because these loopback ports are in use:");
for (const conflict of active) {
  printConflict(conflict);
}

if (active.some((conflict) => conflict.port !== 5173)) {
  console.error(
    "\nPorts 17777 and 17778 are Axon's fixed dev ports. Another live Axon dev session is probably running.",
  );
}

const listenerPidList = active.flatMap((conflict) => conflict.pids);
if (listenerPidList.length > 0) {
  console.error("\nStop the live session and rerun npm run dev:");
  console.error(
    process.platform === "win32"
      ? `  ${listenerPidList.map((pid) => `taskkill /PID ${pid} /F`).join(" && ")}`
      : `  kill ${listenerPidList.join(" ")}`,
  );
} else {
  console.error("\nStop the listener and rerun npm run dev.");
}
console.error("\nTo inspect the listener again on macOS/Linux:");
console.error("  lsof -nP -iTCP:17777 -sTCP:LISTEN");
process.exit(1);
