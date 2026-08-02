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

import { WorkspaceCapabilityRegistry } from "./workspaceCapabilities";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("workspace read capabilities", () => {
  it("keeps LSP definition grants exact, read-only, and renderer-scoped", () => {
    const workspace = createTemporaryDirectory("axon-workspace-");
    const dependency = createTemporaryDirectory("axon-dependency-");
    const workspaceFile = path.join(workspace, "main.go");
    const definitionFile = path.join(dependency, "dir.go");
    const unrelatedFile = path.join(dependency, "secrets.txt");
    fs.writeFileSync(workspaceFile, "package main\n", "utf8");
    fs.writeFileSync(definitionFile, "package os\n", "utf8");
    fs.writeFileSync(unrelatedFile, "not a definition\n", "utf8");

    const registry = new WorkspaceCapabilityRegistry();
    const rendererId = 17;
    registry.authorize(rendererId, workspace);

    expect(registry.assertReadablePath(rendererId, workspaceFile)).toBe(
      fs.realpathSync(workspaceFile),
    );
    expect(registry.isReadOnlyFile(rendererId, workspaceFile)).toBe(false);
    expect(registry.isExternalFile(rendererId, workspaceFile)).toBe(false);
    expect(() =>
      registry.assertReadablePath(rendererId, definitionFile),
    ).toThrow("outside the active workspace");

    // A definition response grants only the returned source file. It must not
    // authorize the dependency directory because that would let the renderer
    // turn one legitimate Go-to-definition result into arbitrary file reads.
    registry.authorizeReadOnlyFile(rendererId, definitionFile);
    expect(registry.assertReadablePath(rendererId, definitionFile)).toBe(
      fs.realpathSync(definitionFile),
    );
    expect(registry.isReadOnlyFile(rendererId, definitionFile)).toBe(true);
    expect(registry.isExternalFile(rendererId, definitionFile)).toBe(true);
    expect(() =>
      registry.assertReadablePath(rendererId, unrelatedFile),
    ).toThrow("outside the active workspace");

    // External definitions never enter the normal workspace capability set,
    // so a save request still fails even after the file has been opened.
    expect(() => registry.assertPath(rendererId, definitionFile)).toThrow(
      "outside the renderer's approved workspaces",
    );
    expect(() =>
      registry.assertWritablePath(rendererId, definitionFile),
    ).toThrow("read-only or outside");

    // A file explicitly dropped onto an editor is a stronger user gesture than
    // an LSP result. Axon grants that exact file save access without granting
    // its parent directory or any neighboring file.
    registry.authorizeFile(rendererId, unrelatedFile);
    expect(registry.assertWritablePath(rendererId, unrelatedFile)).toBe(
      fs.realpathSync(unrelatedFile),
    );
    expect(registry.isReadOnlyFile(rendererId, unrelatedFile)).toBe(false);
    expect(registry.isExternalFile(rendererId, unrelatedFile)).toBe(true);

    registry.releaseRenderer(rendererId);
    expect(() =>
      registry.assertReadablePath(rendererId, definitionFile),
    ).toThrow("outside the active workspace");
  });
});
