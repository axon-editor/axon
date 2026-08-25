import { describe, expect, it } from "vitest";

import {
  createTextMateSemanticTokens,
  resolveContextualTokenType,
  resolveTextMateCaptureCandidates,
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

describe("resolveTextMateCaptureCandidates", () => {
  it("keeps method-call identity instead of flattening it to method", () => {
    expect(
      resolveTextMateCaptureCandidates({
        scopeNames: [
          "source.ts",
          "meta.function-call.ts",
          "entity.name.method.ts",
        ],
        tokenType: "method",
        languageId: "typescript",
        lineContent: "service.fetch()",
        identifier: "fetch",
        startColumnZeroBased: 8,
      })[0],
    ).toBe("function.method.call");
  });

  it("keeps detailed JSON property and string escape captures", () => {
    const propertyCaptures = resolveTextMateCaptureCandidates({
      scopeNames: [
        "source.json",
        "string.quoted.double.json",
        "support.type.property-name.json",
      ],
      tokenType: "property",
      languageId: "json",
      lineContent: '"command": "build\\n"',
      identifier: '"command"',
      startColumnZeroBased: 0,
    });
    const escapeCaptures = resolveTextMateCaptureCandidates({
      scopeNames: [
        "source.json",
        "string.quoted.double.json",
        "constant.character.escape.json",
      ],
      tokenType: "string",
      languageId: "json",
      lineContent: '"build\\n"',
      identifier: "\\n",
      startColumnZeroBased: 6,
    });

    expect(propertyCaptures[0]).toBe("property.json_key");
    expect(escapeCaptures[0]).toBe("string.escape");
  });
});

describe("createTextMateSemanticTokens", () => {
  it("retains detailed captures from real grammar output", async () => {
    const typescript = await createTextMateSemanticTokens({
      languageId: "typescript",
      content: "service.fetch()",
    });
    const json = await createTextMateSemanticTokens({
      languageId: "json",
      content: '{"command": "build\\n"}',
    });

    expect(
      typescript?.tokens.some((token) =>
        token.captureCandidates.includes("function.method.call"),
      ),
    ).toBe(true);
    expect(
      json?.tokens.some((token) =>
        token.captureCandidates.includes("property.json_key"),
      ),
    ).toBe(true);
    expect(
      json?.tokens.some((token) =>
        token.captureCandidates.includes("string.escape"),
      ),
    ).toBe(true);
  });
});
