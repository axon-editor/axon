import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { extractLanguageToolArchive, isSafeArchiveEntry } from "./archive";

function createEmptyZip(fileName: string) {
  const name = Buffer.from(fileName);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(name.length, 26);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(name.length, 28);

  const centralOffset = localHeader.length + name.length;
  const centralSize = centralHeader.length + name.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([localHeader, name, centralHeader, name, end]);
}

describe("managed language tool archive validation", () => {
  it.each([
    "protols",
    "bin/protols",
    "release/bin/protols.exe",
    "nested/directory/",
  ])("accepts a relative archive entry: %s", (entry) => {
    expect(isSafeArchiveEntry(entry)).toBe(true);
  });

  it.each([
    "../protols",
    "bin/../../protols",
    "/usr/local/bin/protols",
    "C:\\Tools\\protols.exe",
    "safe/../../../escape",
    "",
  ])("rejects an unsafe archive entry: %s", (entry) => {
    expect(isSafeArchiveEntry(entry)).toBe(false);
  });

  it.each(["tool.zip", "tool.tar.gz", "tool.gz"])(
    "stops %s extraction before reading files when cancelled",
    async (assetName) => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        extractLanguageToolArchive({
          archivePath: "/missing/tool.archive",
          assetName,
          destination: "/missing/output",
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    },
  );

  it("extracts a validated ZIP entry", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-zip-test-"));
    const archivePath = path.join(root, "tool.zip");
    const destination = path.join(root, "output");
    await fs.mkdir(destination);
    await fs.writeFile(archivePath, createEmptyZip("bin/tool"));

    try {
      await extractLanguageToolArchive({
        archivePath,
        assetName: "tool.zip",
        destination,
        signal: new AbortController().signal,
      });
      await expect(
        fs.stat(path.join(destination, "bin/tool")),
      ).resolves.toBeDefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("cancels ZIP extraction while the archive is opening", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "axon-zip-test-"));
    const archivePath = path.join(root, "tool.zip");
    const destination = path.join(root, "output");
    await fs.mkdir(destination);
    await fs.writeFile(archivePath, createEmptyZip("bin/tool"));
    const controller = new AbortController();

    try {
      const extraction = extractLanguageToolArchive({
        archivePath,
        assetName: "tool.zip",
        destination,
        signal: controller.signal,
      });
      controller.abort();
      await expect(extraction).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
