import { describe, expect, it } from "vitest";
import { extractLanguageToolArchive, isSafeArchiveEntry } from "./archive";

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
});
