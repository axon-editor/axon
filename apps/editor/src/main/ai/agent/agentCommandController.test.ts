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

import { commandSessionAllowlist } from "../../security/commandSessionAllowlist";
import { WorkspaceCapabilityRegistry } from "../../security/workspaceCapabilities";
import { createAgentCommandController } from "./agentCommandController";

const rendererId = 42;
const temporaryDirectories: string[] = [];

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axon-command-"));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "src"));
  const registry = new WorkspaceCapabilityRegistry();
  registry.authorize(rendererId, root);
  return { root, registry };
}

function createController(root: string, registry: WorkspaceCapabilityRegistry) {
  return createAgentCommandController({
    registry,
    rendererId,
    workspaceRoot: root,
    mode: "allowlist",
  });
}

beforeEach(() => {
  commandSessionAllowlist.releaseRenderer(rendererId);
});

afterEach(() => {
  commandSessionAllowlist.releaseRenderer(rendererId);
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("createAgentCommandController", () => {
  it("resolves a relative cwd inside the workspace", async () => {
    const { root, registry } = createWorkspace();
    const controller = createController(root, registry);

    const prepared = await controller.prepare({
      command: "  npm test  ",
      cwd: "src",
    });

    expect(prepared).toEqual({
      command: "npm test",
      cwd: fs.realpathSync(path.join(root, "src")),
    });
  });

  it("rejects a cwd outside the workspace", async () => {
    const { root, registry } = createWorkspace();
    const controller = createController(root, registry);

    await expect(
      controller.prepare({ command: "pwd", cwd: ".." }),
    ).rejects.toThrow("inside the workspace");
  });

  it("rejects a cwd that does not exist", async () => {
    const { root, registry } = createWorkspace();
    const controller = createController(root, registry);

    await expect(
      controller.prepare({ command: "pwd", cwd: "missing" }),
    ).rejects.toThrow("does not exist");
  });

  it("tracks exact command and cwd approvals", async () => {
    const { root, registry } = createWorkspace();
    const controller = createController(root, registry);
    const prepared = await controller.prepare({
      command: "npm test",
      cwd: ".",
    });

    expect(controller.isAllowed(prepared)).toBe(false);
    controller.allow(prepared);
    expect(controller.isAllowed(prepared)).toBe(true);
    expect(
      controller.isAllowed({ ...prepared, command: "npm run build" }),
    ).toBe(false);
  });
});
