/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getDeveloperToolSpawnEnvironment } from "../../../../process/environment";

const execFileAsync = promisify(execFile);
const DETECT_TIMEOUT_MS = 5_000;
const DETECT_CACHE_MS = 30_000;

export interface OpenCodeBinary {
  path: string;
  version: string;
  major: number;
}

let cached:
  | { value: OpenCodeBinary | null; expiresAt: number }
  | undefined;

function versionMajor(version: string) {
  const match = version.match(/(\d+)\./);
  return match ? Number(match[1]) : 0;
}

async function isExecutable(filePath: string) {
  try {
    await fs.access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Finder launches do not inherit the shell PATH, so the explicit candidates
// matter as much as the recovered environment. ~/.opencode/bin is the default
// install location for the CLI that Axon targets.
function binaryCandidates(homePath: string) {
  if (process.platform === "win32") {
    return [path.join(homePath, ".opencode", "bin", "opencode.exe")];
  }

  return [
    path.join(homePath, ".opencode", "bin", "opencode"),
    "/opt/homebrew/bin/opencode",
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  ];
}

export async function detectOpenCodeBinary(): Promise<OpenCodeBinary | null> {
  if (cached?.value && cached.expiresAt > Date.now()) {
    if (await isExecutable(cached.value.path)) return cached.value;
    cached = undefined;
  }

  const env = await getDeveloperToolSpawnEnvironment();
  const homePath = env.HOME ?? os.homedir();
  for (const candidate of ["opencode", ...binaryCandidates(homePath)]) {
    if (candidate !== "opencode" && !(await isExecutable(candidate))) {
      continue;
    }

    try {
      const { stdout } = await execFileAsync(candidate, ["--version"], {
        env,
        timeout: DETECT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
      });
      const version = stdout.trim();
      if (!version) continue;
      const binary = {
        path: candidate,
        version,
        major: versionMajor(version),
      };
      cached = { value: binary, expiresAt: Date.now() + DETECT_CACHE_MS };
      return binary;
    } catch {
      // A candidate that is not executable or does not understand --version is
      // not the OpenCode CLI Axon can manage. Keep probing the next path.
    }
  }

  // Negative results are deliberately not cached. A user can install OpenCode
  // from Axon's terminal while the app is running, and the next runtime refresh
  // must see it without waiting for a cache expiry or restarting Axon.
  return null;
}
