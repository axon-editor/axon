/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Toggle state for the macOS Finder Sync extension. The Swift extension cannot
// talk to Electron, so the settings page flips a tiny JSON file inside the
// user-data directory and the extension reads it every time the Finder builds
// its context menu. A missing preference means "on": the menu item ships
// enabled so a fresh install works without visiting settings first.
//
// The module is deliberately free of Electron imports (the IPC is injected) so
// the parsing and file round-trips are unit-testable under plain Node.

import fs from "node:fs/promises";
import path from "node:path";

export const FINDER_SYNC_PREFERENCE_FILE = "finder-open-in-axon.json";

export function finderSyncPreferencePath(userDataPath: string): string {
  return path.join(userDataPath, FINDER_SYNC_PREFERENCE_FILE);
}

export function parseFinderSyncEnabled(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { enabled?: unknown }).enabled === "boolean"
    ) {
      return (parsed as { enabled: boolean }).enabled;
    }
  } catch {
    // A corrupt preference must not disable the menu item silently.
  }
  return true;
}

export async function readFinderSyncEnabled(
  userDataPath: string,
): Promise<boolean> {
  try {
    const content = await fs.readFile(
      finderSyncPreferencePath(userDataPath),
      "utf8",
    );
    return parseFinderSyncEnabled(content);
  } catch {
    return true;
  }
}

export async function writeFinderSyncEnabled(
  userDataPath: string,
  enabled: boolean,
): Promise<void> {
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(
    finderSyncPreferencePath(userDataPath),
    JSON.stringify({ enabled }, null, "  "),
    "utf8",
  );
}

export interface FinderSyncHandlerPort {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
}

export function registerFinderSyncHandlers(
  ipc: FinderSyncHandlerPort,
  userDataPathFor: () => string,
): void {
  ipc.handle("finderSync:getEnabled", () =>
    readFinderSyncEnabled(userDataPathFor()),
  );
  ipc.handle("finderSync:setEnabled", (_event, enabled: unknown) =>
    writeFinderSyncEnabled(userDataPathFor(), Boolean(enabled)).then(() =>
      readFinderSyncEnabled(userDataPathFor()),
    ),
  );
}