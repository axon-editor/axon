import { describe, expect, it } from "vitest";
import { isSafeArchiveEntry } from "./archive";

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
});
