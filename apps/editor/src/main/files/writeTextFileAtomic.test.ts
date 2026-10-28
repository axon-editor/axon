/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeTextFileAtomic } from "./writeTextFileAtomic";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function temporaryFiles(directory: string) {
  return fs.readdirSync(directory).filter((name) => name.endsWith(".tmp"));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("writeTextFileAtomic", () => {
  it("creates a new text file without leaving a temporary file", async () => {
    const directory = createTemporaryDirectory("axon-atomic-create-");
    const filePath = path.join(directory, "notes.txt");

    await writeTextFileAtomic(filePath, "first line\nsecond line\n");

    expect(fs.readFileSync(filePath, "utf8")).toBe("first line\nsecond line\n");
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o644);
    expect(temporaryFiles(directory)).toEqual([]);
  });

  it("replaces an existing file and preserves its permissions", async () => {
    const directory = createTemporaryDirectory("axon-atomic-replace-");
    const filePath = path.join(directory, "script.sh");
    fs.writeFileSync(filePath, "old body\n", "utf8");
    fs.chmodSync(filePath, 0o640);

    await writeTextFileAtomic(filePath, "new body\n");

    expect(fs.readFileSync(filePath, "utf8")).toBe("new body\n");
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o640);
    expect(temporaryFiles(directory)).toEqual([]);
  });

  it("leaves the old file intact and removes the temp file when rename fails", async () => {
    const directory = createTemporaryDirectory("axon-atomic-rename-failure-");
    const filePath = path.join(directory, "notes.txt");
    fs.writeFileSync(filePath, "old body\n", "utf8");
    vi.spyOn(fs.promises, "rename").mockRejectedValue(
      new Error("rename failed"),
    );

    await expect(writeTextFileAtomic(filePath, "new body\n")).rejects.toThrow(
      "rename failed",
    );

    expect(fs.readFileSync(filePath, "utf8")).toBe("old body\n");
    expect(temporaryFiles(directory)).toEqual([]);
  });

  it("keeps the directory intact when the destination is not a file", async () => {
    const directory = createTemporaryDirectory("axon-atomic-directory-");
    const target = path.join(directory, "folder");
    fs.mkdirSync(target);

    await expect(writeTextFileAtomic(target, "text")).rejects.toThrow(
      "Path is not a file.",
    );

    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(temporaryFiles(directory)).toEqual([]);
  });
});
