/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextFileCache } from "./textFileCache";

const temporaryDirectories: string[] = [];

function temporaryFile(name: string, content: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axon-text-cache-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("TextFileCache", () => {
  it("reuses validated text while still joining concurrent readers", async () => {
    const filePath = temporaryFile("main.ts", "export const value = 1;\n");
    const cache = new TextFileCache();
    const openSpy = vi.spyOn(fs.promises, "open");

    const [first, second] = await Promise.all([
      cache.read(filePath),
      cache.read(filePath),
    ]);
    const third = await cache.read(filePath);

    expect(first).toBe("export const value = 1;\n");
    expect(second).toBe(first);
    expect(third).toBe(first);
    // The cold path opens the file once via fs.promises.open() and uses the
    // same fd for fstat + readFile. Concurrent readers join the same in-flight
    // promise, so only one open happens. The third read is a cache hit (zero
    // syscalls) thanks to the fast path at the top of readCurrentVersion.
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidates watcher changes even when a replacement has the same size", async () => {
    const filePath = temporaryFile("value.txt", "first");
    const cache = new TextFileCache();

    expect(await cache.read(filePath)).toBe("first");
    fs.writeFileSync(filePath, "later", "utf8");
    cache.invalidate(filePath);

    expect(await cache.read(filePath)).toBe("later");
  });

  it("evicts least-recently-used text when the byte budget is exceeded", async () => {
    const firstPath = temporaryFile("first.txt", "12345678");
    const secondPath = temporaryFile("second.txt", "abcdefgh");
    const cache = new TextFileCache({ maxBytes: 20, maxEntries: 10 });
    const openSpy = vi.spyOn(fs.promises, "open");

    await cache.read(firstPath);
    await cache.read(secondPath);
    await cache.read(firstPath);

    // Each file's estimated memory is 16 bytes (Math.max(8, 8*2)), so reading
    // both exceeds the 20-byte budget and evicts the first. The third read is
    // a cache miss that re-opens the file from disk, totaling 3 opens.
    expect(openSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retain binary or invalid UTF-8 input", async () => {
    const binaryPath = temporaryFile("image.bin", "text");
    fs.writeFileSync(binaryPath, Buffer.from([0x41, 0, 0x42]));
    const invalidPath = temporaryFile("invalid.txt", "text");
    fs.writeFileSync(invalidPath, Buffer.from([0xc3, 0x28]));
    const cache = new TextFileCache();

    await expect(cache.read(binaryPath)).rejects.toThrow("binary");
    await expect(cache.read(invalidPath)).rejects.toThrow("valid UTF-8");
  });

  it("detects external edits on cache hits without explicit invalidation", async () => {
    const filePath = temporaryFile("watched.txt", "original");
    const cache = new TextFileCache();

    // First read populates the cache.
    expect(await cache.read(filePath)).toBe("original");

    // Simulate an external edit (formatter, another editor, script) while no
    // watcher is active for this path. Without the stat-based fingerprint check
    // on cache hits, the cache would return stale "original" content forever.
    fs.writeFileSync(filePath, "modified externally", "utf8");

    // The cache should detect the change via stat and return the new content,
    // even though invalidate() was never called.
    expect(await cache.read(filePath)).toBe("modified externally");
  });
});
