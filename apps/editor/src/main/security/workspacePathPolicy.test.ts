import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalWorkspacePath,
  pathInsideWorkspaceRoot,
} from "./workspacePathPolicy";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axon-path-policy-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("workspace path policy", () => {
  it("keeps a missing file under its canonical existing parent", () => {
    const workspace = createTemporaryDirectory();

    expect(canonicalWorkspacePath(path.join(workspace, "new.txt"))).toBe(
      path.join(fs.realpathSync(workspace), "new.txt"),
    );
  });

  it("resolves a symlink parent before checking a missing file", () => {
    const workspace = createTemporaryDirectory();
    const outside = createTemporaryDirectory();
    fs.symlinkSync(outside, path.join(workspace, "outside-link"));

    const candidate = canonicalWorkspacePath(
      path.join(workspace, "outside-link", "new.txt"),
    );

    expect(pathInsideWorkspaceRoot(candidate, fs.realpathSync(workspace))).toBe(
      false,
    );
    expect(candidate).toBe(path.join(fs.realpathSync(outside), "new.txt"));
  });

  it("does not confuse a sibling path prefix with containment", () => {
    const parent = createTemporaryDirectory();
    const workspace = path.join(parent, "project");
    const siblingFile = path.join(parent, "project-copy", "file");

    expect(pathInsideWorkspaceRoot(siblingFile, workspace)).toBe(false);
  });
});
