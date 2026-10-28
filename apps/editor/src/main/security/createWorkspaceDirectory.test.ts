/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { createWorkspaceDirectory } from "./createWorkspaceDirectory";
import { WorkspaceCapabilityRegistry } from "./workspaceCapabilities";

const rendererId = 9;
const temporaryDirectories: string[] = [];

function createWorkspace() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "axon-directory-")),
  );
  temporaryDirectories.push(root);
  const registry = new WorkspaceCapabilityRegistry();
  registry.authorize(rendererId, root);
  return { root, registry };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("createWorkspaceDirectory", () => {
  it("creates nested folders inside the workspace", async () => {
    const { root, registry } = createWorkspace();
    const target = path.join(root, "src", "components", "buttons");

    const created = await createWorkspaceDirectory(
      registry,
      rendererId,
      target,
    );

    expect(created).toBe(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
  });

  it("accepts a folder that already exists", async () => {
    const { root, registry } = createWorkspace();
    const target = path.join(root, "src");
    fs.mkdirSync(target);

    await expect(
      createWorkspaceDirectory(registry, rendererId, target),
    ).resolves.toBe(target);
  });

  it("rejects a folder outside the workspace", async () => {
    const { root, registry } = createWorkspace();

    await expect(
      createWorkspaceDirectory(
        registry,
        rendererId,
        path.join(root, "..", "outside"),
      ),
    ).rejects.toThrow("outside the active workspace");
  });

  it("rejects a path that is already a file", async () => {
    const { root, registry } = createWorkspace();
    const target = path.join(root, "file.txt");
    fs.writeFileSync(target, "content", "utf8");

    await expect(
      createWorkspaceDirectory(registry, rendererId, target),
    ).rejects.toThrow();
  });
});
