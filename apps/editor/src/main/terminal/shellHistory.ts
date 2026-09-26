/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// A zsh history file has no size ceiling of its own and a long-lived machine can
// reach hundreds of megabytes, so the reader pulls a bounded tail window instead
// of loading the whole file into the main process whenever a terminal opens.
export const SHELL_HISTORY_TAIL_BYTES = 1024 * 1024;
export const SHELL_HISTORY_COMMAND_LIMIT = 5000;

const ZSH_EXTENDED_ENTRY = /^: \d+:\d+;(.*)$/;
const FISH_COMMAND_ENTRY = /^\s*- cmd: ?(.*)$/;
const BASH_TIMESTAMP_ENTRY = /^#\d{9,}$/;

interface ShellHistoryEnvironment {
  APPDATA?: string;
  HISTFILE?: string;
  HOME?: string;
  SHELL?: string;
  USERPROFILE?: string;
}

export interface ShellHistoryContext {
  // The shell the terminal host reported it will actually start. It is the
  // authoritative answer, because a desktop launch can leave SHELL unset in this
  // process while the host still falls back to a real shell.
  shell?: string | null;
  env?: ShellHistoryEnvironment;
  platform?: NodeJS.Platform;
}

function normalizeShellName(shell: string | null | undefined) {
  const trimmed = shell?.trim();
  if (!trimmed) return "";
  // A Windows shell arrives as a backslash path such as
  // "C:\\Windows\\...\\powershell.exe" and a Unix one as "/bin/zsh", so the
  // separator has to be split on both even when this process runs on the other
  // platform and path.basename would treat the whole string as one name.
  return trimmed
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(exe|cmd|com)$/i, "")
    .toLowerCase();
}

function fishHistoryPaths(home: string) {
  return [
    path.join(home, ".config", "fish", "fish_history"),
    path.join(home, ".local", "share", "fish", "fish_history"),
  ];
}

// Every supported shell with the files it actually writes. Guessing a file name
// and being wrong yields an empty suggestion list with no way to tell why, so an
// unknown shell falls back to the platform defaults instead.
function getShellHistoryPaths(
  shellName: string,
  env: ShellHistoryEnvironment,
  home: string,
  platform: NodeJS.Platform,
) {
  switch (shellName) {
    case "zsh":
      return [
        path.join(home, ".zsh_history"),
        path.join(home, ".zlocal", "history"),
      ];
    case "bash":
      return [path.join(home, ".bash_history")];
    case "fish":
      return fishHistoryPaths(home);
    case "sh":
      return [path.join(home, ".sh_history"), path.join(home, ".history")];
    case "powershell":
    case "pwsh": {
      const profileRoot =
        platform === "win32"
          ? env.APPDATA?.trim() || path.join(home, "AppData", "Roaming")
          : path.join(home, ".config", "powershell");
      return [
        path.join(
          profileRoot,
          "Microsoft",
          "Windows",
          "PowerShell",
          "PSReadLine",
          "ConsoleHost_history.txt",
        ),
        path.join(
          home,
          ".config",
          "powershell",
          "Microsoft.PowerShell_profile.ps1.history",
        ),
      ];
    }
    default:
      return [];
  }
}

// The renderer cannot read files outside a workspace root, so the home directory
// history files are resolved and read here and only the parsed commands cross the
// IPC boundary. Candidate order matters because the first existing file wins:
// HISTFILE comes first because it is what a shell actually loaded, then the shell
// the terminal host reported, then the platform's own default shell.
export function getShellHistoryCandidates(context: ShellHistoryContext = {}) {
  const env = context.env ?? process.env;
  const platform = context.platform ?? process.platform;
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
  const candidates: string[] = [];

  const configured = env.HISTFILE?.trim();
  if (configured) candidates.push(configured);

  const reportedShell =
    normalizeShellName(context.shell) || normalizeShellName(env.SHELL);
  candidates.push(...getShellHistoryPaths(reportedShell, env, home, platform));

  // A missing or unusual shell still gets the most likely locations for the
  // platform, ordered by how likely they are to hold the user's real history.
  if (platform === "darwin") {
    candidates.push(
      path.join(home, ".zsh_history"),
      path.join(home, ".bash_history"),
    );
  } else if (platform === "win32") {
    const profileRoot =
      env.APPDATA?.trim() || path.join(home, "AppData", "Roaming");
    candidates.push(
      path.join(
        profileRoot,
        "Microsoft",
        "Windows",
        "PowerShell",
        "PSReadLine",
        "ConsoleHost_history.txt",
      ),
    );
  } else {
    candidates.push(
      path.join(home, ".bash_history"),
      path.join(home, ".zsh_history"),
    );
  }

  candidates.push(...fishHistoryPaths(home));
  return [...new Set(candidates)];
}

// One parser for every shell on purpose. A history file is line oriented and the
// per-shell differences are all a small prefix, so recognizing the prefix of
// each known format per line beats branching on the shell name, which a GUI
// launch often cannot report. Unknown lines are still treated as plain commands
// because a user can disable zsh's EXTENDED_HISTORY and fish's metadata blocks
// at any time.
export function parseShellHistory(
  content: string,
  limit = SHELL_HISTORY_COMMAND_LIMIT,
  options?: { isHeadClipped?: boolean },
) {
  const commands: string[] = [];
  const seen = new Set<string>();

  const lines = content.split("\n");
  // A tail read that started in the middle of the file leaves the first line cut
  // in half. Keeping it would put a command like "tatus" in the corpus, which then
  // matches nothing the user ever typed.
  const firstIndex = options?.isHeadClipped ? 1 : 0;
  for (let index = lines.length - 1; index >= firstIndex; index -= 1) {
    const line = lines[index]?.replace(/\r$/, "") ?? "";
    if (!line.trim()) continue;

    // bash writes a lone epoch line above the command when HISTTIMEFORMAT is
    // set, and fish wraps every command in begin/end markers. Neither is a
    // command, so both are dropped before the plain-line fallback.
    if (BASH_TIMESTAMP_ENTRY.test(line)) continue;
    if (line.trim() === "begin;" || line.trim() === "end;") continue;

    const zshEntry = ZSH_EXTENDED_ENTRY.exec(line);
    const fishEntry = FISH_COMMAND_ENTRY.exec(line);
    // fish indents every entry by two spaces and follows each command with
    // indented metadata such as its working directories, so those are dropped.
    // A zsh multi-line command stores its continuation lines unprefixed, which is
    // indistinguishable from a real command, so those lines stay as separate
    // entries rather than being joined back into the command they belong to.
    if (!zshEntry && !fishEntry && /^\s/.test(line)) continue;

    const command = (zshEntry?.[1] ?? fishEntry?.[1] ?? line).trim();
    if (!command) continue;
    if (seen.has(command)) continue;

    seen.add(command);
    commands.push(command);
    if (commands.length >= limit) break;
  }

  return commands;
}

async function readHistoryTail(filePath: string, maxBytes: number) {
  const handle = await open(filePath, "r");
  try {
    const stats = await handle.stat();
    const length = Math.max(0, stats.size);
    const start = Math.max(0, length - maxBytes);
    const buffer = Buffer.alloc(length - start);
    if (buffer.length === 0) return { content: "", isHeadClipped: start > 0 };
    await handle.read(buffer, 0, buffer.length, start);
    return { content: buffer.toString("utf8"), isHeadClipped: start > 0 };
  } finally {
    await handle.close();
  }
}

export async function readShellCommandHistory(options?: {
  env?: ShellHistoryEnvironment;
  limit?: number;
  maxBytes?: number;
  platform?: NodeJS.Platform;
  shell?: string | null;
}) {
  const limit = options?.limit ?? SHELL_HISTORY_COMMAND_LIMIT;
  const maxBytes = options?.maxBytes ?? SHELL_HISTORY_TAIL_BYTES;

  for (const candidate of getShellHistoryCandidates({
    env: options?.env,
    platform: options?.platform,
    shell: options?.shell,
  })) {
    // A missing or unreadable candidate just means this shell keeps no history
    // there. Trying the next candidate keeps a locked-down or containerized
    // home directory from turning into a hard failure for the terminal.
    try {
      const tail = await readHistoryTail(candidate, maxBytes);
      return parseShellHistory(tail.content, limit, {
        isHeadClipped: tail.isHeadClipped,
      });
    } catch {
      continue;
    }
  }

  return [];
}
