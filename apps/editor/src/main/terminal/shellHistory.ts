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
  HOME?: string;
  SHELL?: string;
  HISTFILE?: string;
}

function getShellName(env: ShellHistoryEnvironment) {
  const shellPath = env.SHELL?.trim();
  if (!shellPath) return "";
  return path.basename(shellPath);
}

// The renderer cannot read files outside a workspace root, so the home
// directory history files are resolved and read here and only the parsed
// commands cross the IPC boundary. Candidate order matters because the first
// existing file wins: an explicit HISTFILE always beats a shell default, and an
// unknown shell falls back to probing every known location instead of guessing
// one and returning nothing.
export function getShellHistoryCandidates(env: ShellHistoryEnvironment) {
  const home = env.HOME?.trim() || os.homedir();
  const candidates: string[] = [];

  const configured = env.HISTFILE?.trim();
  if (configured) candidates.push(configured);

  const zshHistory = path.join(home, ".zsh_history");
  const bashHistory = path.join(home, ".bash_history");
  const fishHistories = [
    path.join(home, ".config", "fish", "fish_history"),
    path.join(home, ".local", "share", "fish", "fish_history"),
  ];

  switch (getShellName(env)) {
    case "zsh":
      candidates.push(zshHistory);
      break;
    case "bash":
      candidates.push(bashHistory);
      break;
    case "fish":
      candidates.push(...fishHistories);
      break;
    default:
      // A GUI launch on macOS inherits a minimal environment, so SHELL is often
      // missing entirely. The PTY host falls back to zsh then bash for the same
      // reason, and the same default is the most likely place to find history.
      candidates.push(zshHistory, bashHistory);
  }

  candidates.push(...fishHistories);
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
}) {
  const env = options?.env ?? process.env;
  const limit = options?.limit ?? SHELL_HISTORY_COMMAND_LIMIT;
  const maxBytes = options?.maxBytes ?? SHELL_HISTORY_TAIL_BYTES;

  for (const candidate of getShellHistoryCandidates(env)) {
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
