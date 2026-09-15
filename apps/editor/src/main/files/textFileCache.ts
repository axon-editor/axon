/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";

interface FileFingerprint {
  ctimeMs: number;
  dev: number;
  ino: number;
  mtimeMs: number;
  size: number;
}

interface CachedTextFile {
  content: string;
  fingerprint: FileFingerprint;
  memoryBytes: number;
}

interface TextFileCacheOptions {
  maxBytes?: number;
  maxEntries?: number;
  maxFileBytes?: number;
}

const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 96;
const DEFAULT_MAX_FILE_BYTES = 32 * 1024 * 1024;

function fingerprint(info: fs.Stats): FileFingerprint {
  return {
    ctimeMs: info.ctimeMs,
    dev: info.dev,
    ino: info.ino,
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

function sameFingerprint(left: FileFingerprint, right: FileFingerprint) {
  return (
    left.ctimeMs === right.ctimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mtimeMs === right.mtimeMs &&
    left.size === right.size
  );
}

function estimateStringMemory(content: string, sourceBytes: number) {
  // V8 normally stores JavaScript text as one-byte or two-byte strings. Using
  // the larger UTF-16 estimate prevents the cache budget from claiming that a
  // multibyte source file is cheaper in memory than the decoded string Axon
  // actually retains.
  return Math.max(sourceBytes, content.length * 2);
}

export class TextFileCache {
  private readonly entries = new Map<string, CachedTextFile>();
  private readonly generations = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly maxFileBytes: number;
  private retainedBytes = 0;

  constructor(options: TextFileCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  }

  async read(filePath: string) {
    const pending = this.inFlight.get(filePath);
    if (pending) return pending;

    // Every window joins this promise for the same canonical path. Without the
    // shared in-flight entry, opening one file in two panes or windows can read,
    // decode, and validate the same bytes several times before either request
    // has had a chance to populate the completed cache.
    const request = this.readCurrentVersion(filePath).finally(() => {
      if (this.inFlight.get(filePath) === request) {
        this.inFlight.delete(filePath);
        this.generations.delete(filePath);
      }
    });
    this.inFlight.set(filePath, request);
    return request;
  }

  invalidate(filePath: string) {
    if (this.inFlight.has(filePath)) {
      this.generations.set(filePath, (this.generations.get(filePath) ?? 0) + 1);
    } else {
      this.generations.delete(filePath);
    }
    this.removeEntry(filePath);
  }

  invalidateTree(changedPath: string) {
    this.invalidate(changedPath);
    const pathPrefix = changedPath.endsWith(path.sep)
      ? changedPath
      : `${changedPath}${path.sep}`;
    for (const filePath of this.entries.keys()) {
      if (filePath.startsWith(pathPrefix)) this.invalidate(filePath);
    }
  }

  async recordWrite(filePath: string, content: string) {
    this.invalidate(filePath);
    const info = await fs.promises.stat(filePath);
    if (!info.isFile()) return;
    this.store(filePath, {
      content,
      fingerprint: fingerprint(info),
      memoryBytes: estimateStringMemory(content, info.size),
    });
  }

  clear() {
    this.entries.clear();
    this.generations.clear();
    this.retainedBytes = 0;
  }

  private async readCurrentVersion(filePath: string) {
    // Fast path: trust the cache entry until the file watcher invalidates it.
    // The watcher calls invalidate() which removes the entry, so if we find one
    // here it is still the version the renderer last received. This skips the
    // stat() syscall that used to run on every tab switch, saving 0.1–50ms per
    // cache hit depending on filesystem pressure.
    const cached = this.entries.get(filePath);
    if (cached) {
      this.touch(filePath, cached);
      return cached.content;
    }

    // Cold path: no cached entry exists. We do a stat + read + stat sequence
    // to detect mid-read file replacement by agents or formatters. The three
    // syscalls are not pipelined, but correctness matters more here since this
    // only runs on a cache miss.
    for (let attempt = 0; attempt < 3; attempt++) {
      const generation = this.generations.get(filePath) ?? 0;
      const before = await fs.promises.stat(filePath);
      if (!before.isFile()) throw new Error("Path is not a file.");
      if (before.size > this.maxFileBytes) {
        throw new Error("File is too large to open in the text editor.");
      }

      const beforeFingerprint = fingerprint(before);
      const source = await fs.promises.readFile(filePath);
      const after = await fs.promises.stat(filePath);
      const afterFingerprint = fingerprint(after);
      const generationChanged =
        generation !== (this.generations.get(filePath) ?? 0);

      // Agents and formatters often replace a file while Axon is reading it.
      // Retrying when metadata or the watcher generation changes ensures the
      // cache never publishes bytes assembled from an obsolete disk version.
      if (
        generationChanged ||
        !after.isFile() ||
        !sameFingerprint(beforeFingerprint, afterFingerprint)
      ) {
        continue;
      }

      const sample = source.subarray(0, Math.min(source.length, 8192));
      if (sample.includes(0)) {
        throw new Error("This file is binary and cannot be opened as text.");
      }
      const content = source.toString("utf8");
      if (
        content.includes("\uFFFD") &&
        !Buffer.from(content, "utf8").equals(source)
      ) {
        throw new Error("This file is not valid UTF-8 text.");
      }

      this.store(filePath, {
        content,
        fingerprint: afterFingerprint,
        memoryBytes: estimateStringMemory(content, source.length),
      });
      return content;
    }

    throw new Error("The file kept changing while Axon was opening it.");
  }

  private touch(filePath: string, entry: CachedTextFile) {
    this.entries.delete(filePath);
    this.entries.set(filePath, entry);
  }

  private store(filePath: string, entry: CachedTextFile) {
    this.removeEntry(filePath);
    if (entry.memoryBytes > this.maxBytes) return;
    this.entries.set(filePath, entry);
    this.retainedBytes += entry.memoryBytes;

    while (
      this.entries.size > this.maxEntries ||
      this.retainedBytes > this.maxBytes
    ) {
      const oldestPath = this.entries.keys().next().value as string | undefined;
      if (!oldestPath) break;
      this.removeEntry(oldestPath);
    }
  }

  private removeEntry(filePath: string) {
    const existing = this.entries.get(filePath);
    if (!existing) return;
    this.entries.delete(filePath);
    this.retainedBytes = Math.max(0, this.retainedBytes - existing.memoryBytes);
  }
}

export const textFileCache = new TextFileCache();
