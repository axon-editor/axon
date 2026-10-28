/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveWorkspaceCommandCwd,
  runWorkspaceCommand,
} from "./runWorkspaceCommand";

const temporaryDirectories: string[] = [];

function createWorkspace() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "axon-command-run-")),
  );
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "src"));
  return root;
}

function quoteShellArgument(value: string) {
  if (process.platform === "win32") {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function nodeCommand(script: string) {
  return `${quoteShellArgument(process.execPath)} -e ${quoteShellArgument(script)}`;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveWorkspaceCommandCwd", () => {
  it("defaults to the workspace root", () => {
    const root = createWorkspace();

    expect(resolveWorkspaceCommandCwd(root)).toBe(root);
  });

  it("resolves a relative folder inside the workspace", () => {
    const root = createWorkspace();

    expect(resolveWorkspaceCommandCwd(root, "src")).toBe(
      fs.realpathSync(path.join(root, "src")),
    );
  });

  it("rejects parent traversal and tab URIs", () => {
    const root = createWorkspace();

    expect(() => resolveWorkspaceCommandCwd(root, "..")).toThrow(
      "inside the workspace",
    );
    expect(() =>
      resolveWorkspaceCommandCwd(root, "axon://workbench/problems"),
    ).toThrow("filesystem path");
  });
});

describe("runWorkspaceCommand", () => {
  it("runs inside the requested workspace folder and captures stdout", async () => {
    const root = createWorkspace();

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: root,
      command: nodeCommand("process.stdout.write(process.cwd())"),
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.result).toContain(root);
  });

  it("captures stderr and reports a non-zero exit code", async () => {
    const root = createWorkspace();

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: root,
      command: nodeCommand(
        "process.stderr.write('stderr-message'); process.exit(3)",
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.message).toBe("Exited with code 3.");
    expect(result.result).toContain("stderr-message");
    expect(result.result).toContain("Command exited with code 3.");
  });

  it("removes Axon environment variables from the child environment", async () => {
    const root = createWorkspace();
    const previousToken = process.env.AXON_CORE_TOKEN;
    const previousModelsUrl = process.env.AXON_MODELS_URL;
    process.env.AXON_CORE_TOKEN = "secret-token";
    process.env.AXON_MODELS_URL = "http://secret.example";

    try {
      const result = await runWorkspaceCommand({
        workspaceRoot: root,
        cwd: root,
        command: nodeCommand(
          "process.stdout.write(`${process.env.AXON_CORE_TOKEN ?? 'missing'}:${process.env.AXON_MODELS_URL ?? 'missing'}`)",
        ),
      });

      expect(result.ok).toBe(true);
      expect(result.result).toContain("missing:missing");
      expect(result.result).not.toContain("secret-token");
      expect(result.result).not.toContain("http://secret.example");
    } finally {
      if (previousToken === undefined) {
        delete process.env.AXON_CORE_TOKEN;
      } else {
        process.env.AXON_CORE_TOKEN = previousToken;
      }
      if (previousModelsUrl === undefined) {
        delete process.env.AXON_MODELS_URL;
      } else {
        process.env.AXON_MODELS_URL = previousModelsUrl;
      }
    }
  });

  it("rejects a working directory outside the workspace", async () => {
    const root = createWorkspace();

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: path.dirname(root),
      command: nodeCommand("process.stdout.write('should not run')"),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("inside the workspace");
    expect(result.result).not.toContain("should not run");
  });

  it("keeps only the tail of output above the cap", async () => {
    const root = createWorkspace();

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: root,
      command: nodeCommand("process.stdout.write('x'.repeat(100000))"),
      outputLimitBytes: 1024,
    });

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.result).toContain("[output truncated to the last 1024 bytes]");
    expect(result.result.length).toBeLessThan(2048);
  });

  it("times out and stops the command", async () => {
    const root = createWorkspace();

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: root,
      command: nodeCommand("setTimeout(() => {}, 5000)"),
      timeoutMs: 200,
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.message).toContain("Timed out");
    expect(result.result).toContain("Command timed out");
  });

  it("stops the command when the agent request is cancelled", async () => {
    const root = createWorkspace();
    const controller = new AbortController();
    const cancelTimer = setTimeout(() => controller.abort(), 100);

    const result = await runWorkspaceCommand({
      workspaceRoot: root,
      cwd: root,
      command: nodeCommand("setTimeout(() => {}, 5000)"),
      signal: controller.signal,
    });
    clearTimeout(cancelTimer);

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.message).toBe("Cancelled.");
  });
});
