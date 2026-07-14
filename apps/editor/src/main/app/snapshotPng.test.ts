import { describe, expect, it } from "vitest";
import { decodeSnapshotPng } from "./snapshotPng";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("code snapshot PNG validation", () => {
  it("accepts a base64 PNG with the expected signature", () => {
    const bytes = decodeSnapshotPng(`data:image/png;base64,${onePixelPng}`);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("rejects non-PNG data URLs", () => {
    expect(() =>
      decodeSnapshotPng("data:text/plain;base64,aGVsbG8="),
    ).toThrow("valid PNG");
    expect(() =>
      decodeSnapshotPng("data:image/png;base64,aGVsbG8="),
    ).toThrow("PNG validation");
  });
});
