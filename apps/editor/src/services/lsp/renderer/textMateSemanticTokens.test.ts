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

  it("keeps non-call member access as a property", () => {
    expect(
      resolveTextMateCaptureCandidates({
        scopeNames: ["source.go", "variable.other.go"],
        tokenType: "property",
        languageId: "go",
        lineContent: "cfg.KeyTTL",
        identifier: "KeyTTL",
        startColumnZeroBased: 4,
      }).slice(0, 2),
    ).toEqual(["property", "variable.member"]);
  });

  it("keeps grammar punctuation separate from operators", () => {
    expect(
      resolveTextMateCaptureCandidates({
        scopeNames: ["source.go", "punctuation.definition.parameters.go"],
        tokenType: "operator",
        languageId: "go",
        lineContent: "func main() {}",
        identifier: "(",
        startColumnZeroBased: 9,
      })[0],
    ).toBe("punctuation.bracket");
  });

  it("uses the namespace capture for a Go package name", () => {
    expect(
      resolveTextMateCaptureCandidates({
        scopeNames: ["source.go", "entity.name.package.go"],
        tokenType: "namespace",
        languageId: "go",
        lineContent: "package main",
        identifier: "main",
        startColumnZeroBased: 8,
      })[0],
    ).toBe("namespace");
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

  it("keeps language constants distinct from ordinary variables", () => {
    expect(
      resolveTextMateCaptureCandidates({
        scopeNames: ["source.go", "constant.language.nil.go"],
        tokenType: "variable",
        languageId: "go",
        lineContent: "return nil",
        identifier: "nil",
        startColumnZeroBased: 7,
      })[0],
    ).toBe("constant.builtin");
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

  it("retains Go package, member, and punctuation identity", async () => {
    const go = await createTextMateSemanticTokens({
      languageId: "go",
      content:
        "package main\nfunc main() { cfg := config.Default(); _ = cfg.KeyTTL }",
    });

    expect(
      go?.tokens.some((token) => token.captureCandidates[0] === "namespace"),
    ).toBe(true);
    expect(
      go?.tokens.some(
        (token) => token.captureCandidates[0] === "punctuation.bracket",
      ),
    ).toBe(true);
    expect(
      go?.tokens.some(
        (token) =>
          token.captureCandidates[0] === "property" &&
          token.scopeNames?.some((scope) => scope.includes("variable")),
      ),
    ).toBe(true);
  });

  it("separates Go package qualifiers from their qualified types", async () => {
    const content = [
      "package main",
      'import "net/http"',
      "func handler(w http.ResponseWriter, r *http.Request) http.Header {",
      '  http.Error(w, "failed", http.StatusBadRequest)',
      "  return http.Header{}",
      "}",
    ].join("\n");
    const go = await createTextMateSemanticTokens({
      languageId: "go",
      content,
    });
    const lines = content.split("\n");
    const tokensByText = (text: string) =>
      go?.tokens.filter(
        (token) =>
          lines[token.line]?.slice(
            token.character,
            token.character + token.length,
          ) === text,
      ) ?? [];

    expect(
      tokensByText("http").map((token) => token.captureCandidates[0]),
    ).toEqual([
      "namespace",
      "namespace",
      "namespace",
      "namespace",
      "namespace",
      "namespace",
    ]);
    expect(tokensByText("ResponseWriter")[0]?.captureCandidates[0]).toBe(
      "type:go",
    );
    expect(tokensByText("Request")[0]?.captureCandidates[0]).toBe("type:go");
    expect(
      tokensByText("Header").map((token) => token.captureCandidates[0]),
    ).toEqual(["type:go", "type:go"]);
  });
});
