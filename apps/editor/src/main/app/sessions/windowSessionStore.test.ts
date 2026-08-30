import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: { handle: vi.fn() },
}));

import { WindowSessionStore } from "./windowSessionStore";

const temporaryDirectories: string[] = [];

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axon-sessions-"));
  temporaryDirectories.push(directory);
  return new WindowSessionStore(path.join(directory, "sessions.json"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("WindowSessionStore", () => {
  it("keeps simultaneous renderer sessions independent", () => {
    const store = createStore();
    store.assignRenderer(1, true);
    store.assignRenderer(2, false);
    store.save(1, { folderPath: "/workspace/one" });
    store.save(2, { folderPath: "/workspace/two" });

    expect(store.load(1)).toEqual({ folderPath: "/workspace/one" });
    expect(store.load(2)).toEqual({ folderPath: "/workspace/two" });
  });

  it("restores the most recently active window without reusing it for new windows", () => {
    const store = createStore();
    store.assignRenderer(1, true);
    store.save(1, { folderPath: "/workspace/one" });
    store.assignRenderer(2, false);
    store.save(2, { folderPath: "/workspace/two" });
    store.releaseRenderer(1);
    store.releaseRenderer(2);

    store.assignRenderer(3, true);
    store.assignRenderer(4, false);

    expect(store.load(3)).toEqual({ folderPath: "/workspace/two" });
    expect(store.load(4)).toBeNull();
  });
});
