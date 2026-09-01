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
  it("derives a Git-only capability for an approved nested workspace", () => {
    const repository = createTemporaryDirectory("axon-parent-repository-");
    const unrelatedRepository = createTemporaryDirectory(
      "axon-unrelated-repository-",
    );
    const workspace = path.join(repository, "services", "core");
    const siblingFile = path.join(repository, "apps", "editor", "main.ts");
    const outsideFile = path.join(path.dirname(repository), "outside.txt");
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(path.dirname(siblingFile), { recursive: true });
    fs.writeFileSync(siblingFile, "export {};\n", "utf8");

    const registry = new WorkspaceCapabilityRegistry();
    registry.authorize(7, workspace);

    expect(registry.assertGitRepositoryRoot(7, workspace, repository)).toBe(
      fs.realpathSync(repository),
    );
    expect(
      registry.assertGitRepositoryPath(7, workspace, repository, siblingFile),
    ).toBe(fs.realpathSync(siblingFile));
    expect(() => registry.assertPath(7, siblingFile)).toThrow(
      "outside the renderer's approved workspaces",
    );
    expect(() =>
      registry.assertGitRepositoryPath(7, workspace, repository, outsideFile),
    ).toThrow("outside the approved Git repository");
    expect(() =>
      registry.assertGitRepositoryRoot(7, workspace, unrelatedRepository),
    ).toThrow("does not contain the approved workspace");
  });

  it("resolves terminal ownership to the most specific approved workspace", () => {
    const parent = createTemporaryDirectory("axon-parent-workspace-");
    const nested = path.join(parent, "packages", "editor");
    fs.mkdirSync(nested, { recursive: true });

    const registry = new WorkspaceCapabilityRegistry();
    registry.authorize(9, parent);
    registry.authorize(9, nested);

    expect(registry.resolveRootForPath(9, path.join(nested, "src"))).toBe(
      fs.realpathSync(nested),
    );
    expect(() => registry.resolveRootForPath(10, nested)).toThrow(
      "outside the renderer's approved workspaces",
    );
  });

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
