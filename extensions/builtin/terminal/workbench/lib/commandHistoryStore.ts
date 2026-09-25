/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The corpus is shared by every terminal tab in the window, so the history file
// is read once instead of per tab, and a command the user just ran is available
// to the next keystroke without waiting for the shell to flush its own file.
const COMMAND_HISTORY_TTL_MS = 60_000;
const COMMAND_HISTORY_LIMIT = 5000;

let fileCommands: string[] = [];
let sessionCommands: string[] = [];
let mergedCommands: string[] = [];
let isMergedStale = false;
let hasLoaded = false;
let loadedAt = 0;
let pendingLoad: Promise<string[]> | null = null;

// A fresh terminal is the natural moment to re-read the file, because that is
// when a shell in another window is most likely to have appended to it. The TTL
// keeps a long session from re-reading on every new tab.
function isCacheFresh() {
  return hasLoaded && Date.now() - loadedAt < COMMAND_HISTORY_TTL_MS;
}

export async function loadCommandHistory() {
  if (pendingLoad) return pendingLoad;
  if (isCacheFresh()) return getCommandHistory();

  pendingLoad = (async () => {
    try {
      fileCommands = await window.axon.getTerminalCommandHistory();
      isMergedStale = true;
      hasLoaded = true;
      loadedAt = Date.now();
    } catch {
      // A terminal without history still works, it just has nothing to suggest.
      hasLoaded = true;
    }
    return getCommandHistory();
  })().finally(() => {
    pendingLoad = null;
  });

  return pendingLoad;
}

// Shells only flush their history file on exit, so commands typed in this window
// would be missing from the corpus for the rest of the session. Recording them
// on Enter mirrors what the shell will eventually write, including the
// ignorespace rule, and keeps a command the user just ran as the first candidate
// for the next identical prefix.
//
// The live commands are kept out of the file list on purpose: a load can still be
// in flight when the user runs a command, and merging afterwards would let the
// slower read drop what was just typed.
export function recordTypedCommand(line: string) {
  const command = line.trimEnd();
  if (!command.trim()) return;
  if (command !== command.trimStart()) return;

  sessionCommands = [
    command,
    ...sessionCommands.filter((existing) => existing !== command),
  ].slice(0, COMMAND_HISTORY_LIMIT);
  isMergedStale = true;
}

export function getCommandHistory() {
  if (!isMergedStale) return mergedCommands;

  const seen = new Set<string>();
  mergedCommands = [...sessionCommands, ...fileCommands]
    .filter((command) => {
      if (seen.has(command)) return false;
      seen.add(command);
      return true;
    })
    .slice(0, COMMAND_HISTORY_LIMIT);
  isMergedStale = false;
  return mergedCommands;
}

// The cache lives in module state, so tests need one entry point to clear it
// between cases instead of depending on the order they happen to run in.
export function resetCommandHistoryForTests() {
  fileCommands = [];
  sessionCommands = [];
  mergedCommands = [];
  isMergedStale = false;
  hasLoaded = false;
  loadedAt = 0;
  pendingLoad = null;
}
