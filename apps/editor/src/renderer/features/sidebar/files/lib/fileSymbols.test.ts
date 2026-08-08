import { describe, expect, it } from "vitest";
import { LARGE_DOCUMENT_LINE_THRESHOLD } from "../../../../../shared/largeDocument";
import { collectFileSymbols } from "./fileSymbols";

describe("collectFileSymbols", () => {
  it("extracts symbols from normal source files", () => {
    expect(collectFileSymbols("export function renderEditor() {}\n")).toEqual([
      expect.objectContaining({
        kind: "function",
        line: 1,
        name: "renderEditor",
      }),
    ]);
  });

  it("does not synchronously scan generated large documents", () => {
    const content = `${"value\n".repeat(LARGE_DOCUMENT_LINE_THRESHOLD)}function tooLate() {}`;

    expect(collectFileSymbols(content)).toEqual([]);
  });
});
