import { describe, expect, it } from "vitest";

import { resolveTextMateTokenType } from "./textMateSemanticTokens";

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
});
