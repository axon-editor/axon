import { describe, expect, it } from "vitest";

import {
  resolveContextualTokenType,
  resolveTextMateTokenType,
} from "./textMateSemanticTokens";

describe("resolveTextMateTokenType", () => {
  it("classifies quoted JSON object keys as properties", () => {
    expect(
      resolveTextMateTokenType([
        "source.json",
        "meta.structure.dictionary.json",
        "string.quoted.double.json",
        "support.type.property-name.json",
      ]),
    ).toBe("property");
  });

  it("keeps JSON values classified as strings", () => {
    expect(
      resolveTextMateTokenType([
        "source.json",
        "meta.structure.dictionary.value.json",
        "string.quoted.double.json",
      ]),
    ).toBe("string");
  });

  it("classifies quoted Python dictionary keys as properties", () => {
    expect(
      resolveContextualTokenType({
        baseTokenType: "string",
        languageId: "python",
        lineContent: '    "category": issue.category,',
        identifier: '"category"',
        startColumnZeroBased: 4,
      }),
    ).toBe("property");
  });

  it("keeps quoted Python dictionary values classified as strings", () => {
    expect(
      resolveContextualTokenType({
        baseTokenType: "string",
        languageId: "python",
        lineContent: '    "message": "Issue details.",',
        identifier: '"Issue details."',
        startColumnZeroBased: 15,
      }),
    ).toBe("string");
  });
});
