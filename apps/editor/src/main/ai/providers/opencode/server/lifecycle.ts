/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { terminateChildProcess } from "../../../../core/process/process";
import { getDeveloperToolSpawnEnvironment } from "../../../../process/environment";
import { detectOpenCodeBinary } from "../binary/detect";

const START_TIMEOUT_ATTEMPTS = 80;
const START_POLL_MS = 200;
const LOG_LIMIT = 8_192;

// Axon never attaches to the user's background OpenCode service because that
// service can be configured to run tools without an approval round trip. The
// managed child gets an Axon-owned password and permission rules so every
// mutating tool goes through the sidebar.
const MANAGED_PERMISSION_CONFIG = JSON.stringify({
  permission: {
    bash: "ask",
    edit: "ask",
    webfetch: "ask",
  },
});

export interface OpenCodeServerHandle {
  baseUrl: string;
  folderPath: string;
  logs: string[];
  password: string;
  process: ChildProcess;
}

let current: OpenCodeServerHandle | null = null;
let starting: Promise<OpenCodeServerHandle> | null = null;
// Stops racing a server that is mid-start. The late start sees the changed
// generation and terminates its own child instead of publishing a handle that
// shutdown already forgot about.
let generation = 0;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an OpenCode server port."));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function appendLog(logs: string[], chunk: Buffer | string) {
  logs.push(chunk.toString());
  let size = logs.reduce((total, entry) => total + entry.length, 0);
  while (size > LOG_LIMIT && logs.length > 1) {
    size -= logs.shift()?.length ?? 0;
  }
}

async function startServer(
  binaryPath: string,
  folderPath: string,
): Promise<OpenCodeServerHandle> {
  const port = await findFreePort();
  const password = randomBytes(24).toString("hex");
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = await getDeveloperToolSpawnEnvironment();
  const child = spawn(
    binaryPath,
    ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: folderPath,
      env: {
        ...env,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_CONFIG_CONTENT: MANAGED_PERMISSION_CONFIG,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs: string[] = [];
  let spawnError: Error | null = null;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stdout?.on("data", (chunk) => appendLog(logs, chunk));
  child.stderr?.on("data", (chunk) => appendLog(logs, chunk));

  const handle: OpenCodeServerHandle = {
    baseUrl,
    folderPath,
    logs,
    password,
    process: child,
  };
  child.on("exit", () => {
    if (current === handle) current = null;
  });

  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  for (let attempt = 0; attempt < START_TIMEOUT_ATTEMPTS; attempt += 1) {
    if (spawnError) {
      throw spawnError;
    }
    if (child.exitCode !== null) {
      throw new Error(`OpenCode server exited during startup.\n${logs.join("")}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/info`, {
        headers: { Authorization: authorization },
      });
      if (response.ok) return handle;
    } catch {
      // The listener may not be bound yet. Keep polling until the deadline.
    }

    await delay(START_POLL_MS);
  }

  await terminateChildProcess(child);
  throw new Error(`OpenCode server did not start.\n${logs.join("")}`);
}

export async function ensureOpenCodeServer(
  folderPath: string,
): Promise<OpenCodeServerHandle> {
  if (
    current?.folderPath === folderPath &&
    current.process.exitCode === null
  ) {
    return current;
  }

  if (starting) {
    const pending = await starting;
    if (pending.folderPath === folderPath) return pending;
  }

  // The managed server is workspace-scoped. Starting a new one without
  // terminating the old child would leave an unowned process holding its port
  // and its permission state.
  await stopOpenCodeServer();

  const binary = await detectOpenCodeBinary();
  if (!binary) {
    throw new Error("OpenCode is not installed.");
  }

  const startGeneration = ++generation;
  starting = startServer(binary.path, folderPath);
  try {
    const handle = await starting;
    if (startGeneration !== generation) {
      await terminateChildProcess(handle.process);
      throw new Error("OpenCode server startup was cancelled.");
    }
    if (handle.process.exitCode !== null) {
      throw new Error(`OpenCode server exited during startup.\n${handle.logs.join("")}`);
    }
    current = handle;
    return handle;
  } finally {
    starting = null;
  }
}

export async function stopOpenCodeServer(): Promise<void> {
  generation += 1;
  const pending = starting;
  if (pending) {
    try {
      const handle = await pending;
      if (handle.process.exitCode === null) {
        await terminateChildProcess(handle.process);
      }
    } catch {
      // The startup already failed and cleaned up its child.
    }
  }

  const handle = current;
  current = null;
  if (handle && handle.process.exitCode === null) {
    await terminateChildProcess(handle.process);
  }
}
