/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from "child_process";
import { promisify } from "util";
import { getDeveloperToolSpawnEnvironment } from "../../process/environment";

const execFileAsync = promisify(execFile);

// Git refreshes the index opportunistically during `status` and some diff/log
// commands. Two Axon windows polling the same repository can then race on
// `.git/index.lock`, and a failed refresh used to be reported as "not a Git
// repository". Optional locks are unnecessary for read-only inspection.
const READ_ONLY_GIT_COMMANDS = new Set([
  "rev-parse",
  "status",
  "ls-files",
  "diff",
  "log",
  "show",
  "blame",
  "for-each-ref",
  "rev-list",
  "merge-base",
  "cat-file",
  "describe",
  "symbolic-ref",
  "remote",
  "check-ignore",
  "name-rev",
]);

function gitCommandEnvironment(
  args: string[],
  baseEnvironment: NodeJS.ProcessEnv,
) {
  const command = args[0] ?? "";
  return READ_ONLY_GIT_COMMANDS.has(command)
    ? { ...baseEnvironment, GIT_OPTIONAL_LOCKS: "0" }
    : baseEnvironment;
}

// A Finder or Dock launch gives Electron a much smaller environment than a
// Terminal launch. Recovering the developer shell environment once makes the
// packaged app resolve the same git binary, hooks, and credential helpers that
// work in the user's terminal, which is also what development runs inherit.
let gitEnvironmentPromise: Promise<NodeJS.ProcessEnv> | null = null;
function getGitEnvironment() {
  gitEnvironmentPromise ??= getDeveloperToolSpawnEnvironment().catch(
    () => process.env,
  );
  return gitEnvironmentPromise;
}

function gitCommandTimeout(args: string[]) {
  // Cheap metadata commands should fail fast. A stuck credential helper or
  // broken repository should not make a settings/status refresh wait behind
  // the same timeout budget as expensive diff/show operations.
  const command = args[0] ?? "";
  if (command === "rev-parse" || command === "branch") return 5000;
  if (command === "status" || command === "ls-files") return 10000;
  return 30000;
}

export async function runGit(
  folderPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const environment = await getGitEnvironment();
  const result = await execFileAsync("git", ["-C", folderPath, ...args], {
    timeout: gitCommandTimeout(args),
    maxBuffer: 1024 * 1024 * 8,
    env: gitCommandEnvironment(args, environment),
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function findGitRepositoryRoot(folderPath: string) {
  try {
    const result = await runGit(folderPath, ["rev-parse", "--show-toplevel"]);
    const root = result.stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}
