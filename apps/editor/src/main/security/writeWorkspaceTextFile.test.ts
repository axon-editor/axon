/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { textFileCache } from "../files/textFileCache";
import { WorkspaceCapabilityRegistry } from "./workspaceCapabilities";
import { writeWorkspaceTextFile } from "./writeWorkspaceTextFile";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(() => {
  textFileCache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("writeWorkspaceTextFile", () => {
  it("writes an authorized file and records it in the text cache", async () => {
    const workspace = createTemporaryDirectory("axon-workspace-write-");
    const filePath = path.join(workspace, "notes.txt");
    const registry = new WorkspaceCapabilityRegistry();
    registry.authorize(3, workspace);

    const writtenPath = await writeWorkspaceTextFile(
      registry,
      3,
      filePath,
      "agent output\n",
    );

    expect(writtenPath).toBe(fs.realpathSync(filePath));
    expect(fs.readFileSync(filePath, "utf8")).toBe("agent output\n");
    await expect(textFileCache.read(writtenPath)).resolves.toBe(
      "agent output\n",
    );
  });

  it("refuses a path outside the renderer's approved workspace", async () => {
    const workspace = createTemporaryDirectory("axon-workspace-write-");
    const outside = createTemporaryDirectory("axon-outside-write-");
    const outsideFile = path.join(outside, "secret.txt");
    const registry = new WorkspaceCapabilityRegistry();
    registry.authorize(3, workspace);

    await expect(
      writeWorkspaceTextFile(registry, 3, outsideFile, "no\n"),
    ).rejects.toThrow("read-only or outside");
    expect(fs.existsSync(outsideFile)).toBe(false);
  });

  it("invalidates the cache when the post-write stat cannot finish", async () => {
    const workspace = createTemporaryDirectory("axon-workspace-write-");
    const filePath = path.join(workspace, "notes.txt");
    const registry = new WorkspaceCapabilityRegistry();
    registry.authorize(3, workspace);
    vi.spyOn(textFileCache, "recordWrite").mockRejectedValueOnce(
      new Error("path disappeared"),
    );
    const invalidate = vi.spyOn(textFileCache, "invalidate");

    await writeWorkspaceTextFile(registry, 3, filePath, "still saved\n");

    expect(fs.readFileSync(filePath, "utf8")).toBe("still saved\n");
    expect(invalidate).toHaveBeenCalledWith(fs.realpathSync(filePath));
  });
});
