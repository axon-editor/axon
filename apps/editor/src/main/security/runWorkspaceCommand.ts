/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { getDeveloperToolSpawnEnvironment } from "../process/environment";
import { terminateProcessTree } from "../process/terminateProcessTree";
import {
  canonicalWorkspacePath,
  pathInsideWorkspaceRoot,
} from "./workspacePathPolicy";

export const WORKSPACE_COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
export const WORKSPACE_COMMAND_OUTPUT_LIMIT_BYTES = 64 * 1024;

const URI_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);
const PRIVATE_ENVIRONMENT_PREFIX = "AXON_";

export interface WorkspaceCommandOptions {
  workspaceRoot: string;
  command: string;
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  outputLimitBytes?: number;
}

export interface WorkspaceCommandResult {
  ok: boolean;
  message: string;
  result: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

// The command card and the model both need the tail of a failed build rather
// than the first progress lines. Keeping only the newest bytes also bounds what
// one command can add to the model context and to a persisted conversation.
class CappedOutput {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;
  private truncated = false;

  constructor(private readonly limitBytes: number) {}

  append(chunk: Buffer) {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.byteLength += chunk.length;

    while (this.byteLength > this.limitBytes && this.chunks.length > 0) {
      const overflow = this.byteLength - this.limitBytes;
      const first = this.chunks[0];
      if (first.length <= overflow) {
        this.chunks.shift();
        this.byteLength -= first.length;
      } else {
        this.chunks[0] = first.subarray(overflow);
        this.byteLength -= overflow;
      }
      this.truncated = true;
    }
  }

  get isTruncated() {
    return this.truncated;
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function getShellCommand(command: string) {
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }

  const configuredShell = process.env.SHELL;
  const shell =
    configuredShell &&
    path.isAbsolute(configuredShell) &&
    fs.existsSync(configuredShell)
      ? configuredShell
      : "/bin/sh";
  return { file: shell, args: ["-c", command] };
}

async function getCommandEnvironment() {
  const environment = await getDeveloperToolSpawnEnvironment();
  for (const key of Object.keys(environment)) {
    if (key.startsWith(PRIVATE_ENVIRONMENT_PREFIX)) delete environment[key];
  }

  // Commands run without a TTY, so color and pager hints only add escape codes
  // or leave a process waiting for input that can never arrive.
  environment.TERM = "dumb";
  environment.NO_COLOR = "1";
  environment.CLICOLOR = "0";
  environment.FORCE_COLOR = "0";
  environment.PAGER = "cat";
  environment.GIT_PAGER = "cat";
  environment.GIT_TERMINAL_PROMPT = "0";
  return environment;
}

function formatCommandResult(input: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  outputLimitBytes: number;
}) {
  const lines: string[] = [];
  if (input.timedOut) {
    lines.push(`Command timed out after ${formatDuration(input.durationMs)}.`);
  } else if (input.cancelled) {
    lines.push("Command cancelled.");
  } else if (input.exitCode === 0) {
    lines.push("Command finished successfully.");
  } else if (input.exitCode !== null) {
    lines.push(`Command exited with code ${input.exitCode}.`);
  } else if (input.signal) {
    lines.push(`Command stopped by ${input.signal}.`);
  } else {
    lines.push("Command did not report an exit code.");
  }

  if (input.truncated) {
    lines.push(
      `[output truncated to the last ${input.outputLimitBytes} bytes]`,
    );
  }

  const output = input.output.replace(ANSI_ESCAPE_PATTERN, "").trimEnd();
  lines.push("", output || "(no output)");
  return lines.join("\n");
}

function commandMessage(input: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
}) {
  if (input.timedOut) {
    return `Timed out after ${formatDuration(input.durationMs)}.`;
  }
  if (input.cancelled) return "Cancelled.";
  if (input.exitCode === 0) return "Finished.";
  if (input.exitCode !== null) return `Exited with code ${input.exitCode}.`;
  if (input.signal) return `Stopped by ${input.signal}.`;
  return "Did not report an exit code.";
}

function failedResult(
  startedAt: number,
  message: string,
): WorkspaceCommandResult {
  return {
    ok: false,
    message,
    result: message,
    exitCode: null,
    signal: null,
    truncated: false,
    timedOut: false,
    cancelled: false,
    durationMs: Date.now() - startedAt,
  };
}

function cancelledResult(startedAt: number): WorkspaceCommandResult {
  return {
    ok: false,
    message: "Cancelled.",
    result: "Command cancelled.",
    exitCode: null,
    signal: null,
    truncated: false,
    timedOut: false,
    cancelled: true,
    durationMs: Date.now() - startedAt,
  };
}

export function resolveWorkspaceCommandCwd(
  workspaceRoot: string,
  rawCwd?: string,
) {
  const root = canonicalWorkspacePath(workspaceRoot);
  const trimmedCwd = rawCwd?.trim();
  if (trimmedCwd && URI_SCHEME_PATTERN.test(trimmedCwd)) {
    throw new Error("cwd needs a filesystem path, not a tab URI.");
  }

  const candidate = trimmedCwd ? path.resolve(root, trimmedCwd) : root;
  const canonicalCwd = canonicalWorkspacePath(candidate);
  if (!pathInsideWorkspaceRoot(canonicalCwd, root)) {
    throw new Error("Command working directory must stay inside the workspace.");
  }
  return canonicalCwd;
}

export async function runWorkspaceCommand(
  input: WorkspaceCommandOptions,
): Promise<WorkspaceCommandResult> {
  const timeoutMs = input.timeoutMs ?? WORKSPACE_COMMAND_TIMEOUT_MS;
  const outputLimitBytes =
    input.outputLimitBytes ?? WORKSPACE_COMMAND_OUTPUT_LIMIT_BYTES;
  const startedAt = Date.now();

  if (input.signal?.aborted) {
    return cancelledResult(startedAt);
  }

  let cwd: string;
  try {
    cwd = resolveWorkspaceCommandCwd(input.workspaceRoot, input.cwd);
  } catch (error) {
    return failedResult(
      startedAt,
      error instanceof Error ? error.message : "Invalid working directory.",
    );
  }

  const environment = await getCommandEnvironment();
  if (input.signal?.aborted) {
    return cancelledResult(startedAt);
  }

  const { file, args } = getShellCommand(input.command);
  const output = new CappedOutput(outputLimitBytes);
  let child: ChildProcess;
  try {
    child = spawn(file, args, {
      cwd,
      env: environment,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return failedResult(startedAt, `Could not start command: ${message}`);
  }

  child.stdout?.on("data", (chunk: Buffer) => output.append(chunk));
  child.stderr?.on("data", (chunk: Buffer) => output.append(chunk));

  return new Promise((resolve) => {
    let finished = false;
    let timedOut = false;
    let cancelled = false;
    let spawnError: string | null = null;
    let timeout: NodeJS.Timeout | null = null;

    const finish = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      input.signal?.removeEventListener("abort", onAbort);

      const durationMs = Date.now() - startedAt;
      const result = {
        exitCode,
        signal,
        output: output.text(),
        truncated: output.isTruncated,
        timedOut,
        cancelled,
        durationMs,
        outputLimitBytes,
      };
      resolve({
        ok:
          !timedOut &&
          !cancelled &&
          !spawnError &&
          exitCode === 0,
        message: spawnError
          ? `Could not start command: ${spawnError}`
          : commandMessage(result),
        result: spawnError
          ? `Could not start command: ${spawnError}`
          : formatCommandResult(result),
        exitCode,
        signal,
        truncated: result.truncated,
        timedOut,
        cancelled,
        durationMs,
      });
    };

    const onAbort = () => {
      cancelled = true;
      terminateProcessTree(child);
    };

    timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);
    timeout.unref();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted) onAbort();

    child.once("error", (error) => {
      spawnError = error.message;
      finish(null, null);
    });
    child.once("close", (exitCode, signal) => finish(exitCode, signal));
  });
}
