/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  finderSyncPreferencePath,
  parseFinderSyncEnabled,
  readFinderSyncEnabled,
  registerFinderSyncHandlers,
  writeFinderSyncEnabled,
} from "./finderSync";

const tempDirs: string[] = [];

async function makeUserData(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "axon-finder-sync-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("finderSync preference", () => {
  it("points the preference file at the userData directory", () => {
    expect(finderSyncPreferencePath("/tmp/Axon")).toBe(
      path.join("/tmp/Axon", "finder-open-in-axon.json"),
    );
  });

  it("enables the menu when no preference file exists yet", async () => {
    expect(await readFinderSyncEnabled(await makeUserData())).toBe(true);
  });

  it("round-trips a disabled preference", async () => {
    const userData = await makeUserData();
    await writeFinderSyncEnabled(userData, false);

    expect(await readFinderSyncEnabled(userData)).toBe(false);
    const written = JSON.parse(
      await readFile(finderSyncPreferencePath(userData), "utf8"),
    );
    expect(written).toEqual({ enabled: false });
  });

  it("keeps a parsed boolean regardless of surrounding file shape", () => {
    expect(parseFinderSyncEnabled('{"enabled": false}')).toBe(false);
    expect(parseFinderSyncEnabled('{"enabled": true}')).toBe(true);
  });

  it("falls back to enabled for corrupt or incomplete files", () => {
    expect(parseFinderSyncEnabled("not json")).toBe(true);
    expect(parseFinderSyncEnabled("{}")).toBe(true);
    expect(parseFinderSyncEnabled('{"enabled": "yes"}')).toBe(true);
    expect(parseFinderSyncEnabled("[]")).toBe(true);
  });
});

describe("finderSync IPC handlers", () => {
  it("answers get and set with the persisted value", async () => {
    const userData = await makeUserData();
    const listeners = new Map<string, (...args: unknown[]) => unknown>();
    registerFinderSyncHandlers(
      {
        handle: (channel, listener) => {
          listeners.set(channel, listener);
        },
      },
      () => userData,
    );

    expect(await listeners.get("finderSync:getEnabled")!()).toBe(true);
    await listeners.get("finderSync:setEnabled")!({}, false);
    expect(await listeners.get("finderSync:getEnabled")!()).toBe(false);

    await listeners.get("finderSync:setEnabled")!({}, true);
    expect(await listeners.get("finderSync:getEnabled")!()).toBe(true);
  });
});
