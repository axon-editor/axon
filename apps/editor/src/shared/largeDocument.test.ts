import { describe, expect, it } from "vitest";
import {
  LARGE_DOCUMENT_CHARACTER_THRESHOLD,
  LARGE_DOCUMENT_LINE_THRESHOLD,
  isLargeDocumentContent,
  isLargeDocumentModel,
} from "./largeDocument";

describe("large document policy", () => {
  it("keeps ordinary source files on the full editor feature path", () => {
    expect(isLargeDocumentContent('{"ready": true}\n')).toBe(false);
    expect(
      isLargeDocumentModel({
        getLineCount: () => LARGE_DOCUMENT_LINE_THRESHOLD - 1,
        getValueLength: () => LARGE_DOCUMENT_CHARACTER_THRESHOLD - 1,
      }),
    ).toBe(false);
  });

  it("detects documents by either character or line pressure", () => {
    expect(
      isLargeDocumentContent("x".repeat(LARGE_DOCUMENT_CHARACTER_THRESHOLD)),
    ).toBe(true);
    expect(
      isLargeDocumentContent("\n".repeat(LARGE_DOCUMENT_LINE_THRESHOLD - 1)),
    ).toBe(true);
    expect(
      isLargeDocumentModel({
        getLineCount: () => 2,
        getValueLength: () => LARGE_DOCUMENT_CHARACTER_THRESHOLD,
      }),
    ).toBe(true);
  });
});
