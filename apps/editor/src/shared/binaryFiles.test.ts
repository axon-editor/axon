import { describe, expect, it } from "vitest";
import { getKnownBinaryFileKind, isKnownBinaryFile } from "./binaryFiles";

describe("binary file classification", () => {
  it("routes Office spreadsheets away from text editors", () => {
    expect(getKnownBinaryFileKind("/workspace/reports/Budget.XLSX")).toBe(
      "spreadsheet",
    );
    expect(isKnownBinaryFile("/workspace/reports/legacy.xls")).toBe(true);
  });

  it("keeps source files eligible for text loading", () => {
    expect(getKnownBinaryFileKind("/workspace/src/report.ts")).toBeNull();
    expect(isKnownBinaryFile("/workspace/.env")).toBe(false);
  });
});
