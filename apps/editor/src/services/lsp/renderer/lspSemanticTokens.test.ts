import { describe, expect, it } from "vitest";

import {
  decodeLanguageServerSemanticTokens,
  mergeHighlightTokenLayers,
  type HighlightToken,
} from "./highlightTokenMerge";

interface TestToken {
  line: number;
  character: number;
  length: number;
  type: string;
}

function createTokens(tokens: TestToken[], source: "lsp" | "textmate") {
  return {
    tokens: tokens.map(
      (token): HighlightToken => ({
        line: token.line,
        character: token.character,
        length: token.length,
        tokenType: token.type,
        modifiers: [],
        captureCandidates:
          token.type === "method" ? ["function.method"] : [token.type],
        source,
        languageId: "typescript",
      }),
    ),
  };
}

describe("semantic token layer merging", () => {
  it("keeps grammar-owned structure over a weaker LSP classification", () => {
    const textMate = createTokens(
      [{ line: 0, character: 0, length: 5, type: "keyword" }],
      "textmate",
    );
    const merged = mergeHighlightTokenLayers({
      lsp: createTokens(
        [{ line: 0, character: 0, length: 5, type: "variable" }],
        "lsp",
      ),
      textMate,
    });

    expect(merged?.tokens).toEqual(textMate.tokens);
  });

  it("keeps project-aware symbols over a weaker grammar classification", () => {
    const lsp = createTokens(
      [{ line: 0, character: 0, length: 8, type: "function" }],
      "lsp",
    );
    const merged = mergeHighlightTokenLayers({
      lsp,
      textMate: createTokens(
        [{ line: 0, character: 0, length: 8, type: "variable" }],
        "textmate",
      ),
    });

    expect(merged?.tokens).toEqual(lsp.tokens);
  });

  it("uses preserved grammar capture identity when the base type is generic", () => {
    const textMate = createTokens(
      [{ line: 0, character: 8, length: 5, type: "variable" }],
      "textmate",
    );
    textMate.tokens[0].captureCandidates = [
      "function.method.call",
      "function.method",
    ];
    const merged = mergeHighlightTokenLayers({
      lsp: createTokens(
        [{ line: 0, character: 8, length: 5, type: "variable" }],
        "lsp",
      ),
      textMate,
    });

    expect(merged?.tokens).toEqual(textMate.tokens);
  });

  it("preserves non-overlapping tokens from both sources in document order", () => {
    const expected = createTokens(
      [
        { line: 0, character: 0, length: 3, type: "keyword" },
        { line: 0, character: 4, length: 8, type: "function" },
      ],
      "textmate",
    );
    expected.tokens[1].source = "lsp";
    const merged = mergeHighlightTokenLayers({
      lsp: createTokens(
        [{ line: 0, character: 4, length: 8, type: "function" }],
        "lsp",
      ),
      textMate: createTokens(
        [{ line: 0, character: 0, length: 3, type: "keyword" }],
        "textmate",
      ),
    });

    expect(merged?.tokens).toEqual(expected.tokens);
  });

  it("merges large token streams without comparing every token pair", () => {
    const tokenCount = 20_000;
    const lsp = createTokens(
      Array.from({ length: tokenCount }, (_, line) => ({
        line,
        character: 0,
        length: 8,
        type: "function" as const,
      })),
      "lsp",
    );
    const textMate = createTokens(
      Array.from({ length: tokenCount }, (_, line) => ({
        line,
        character: 0,
        length: 8,
        type: "variable" as const,
      })),
      "textmate",
    );

    // This fixture represents a large source file with one overlapping token
    // from each source on every line. A pairwise merge performs 400 million
    // overlap checks here and blocks the renderer; the ordered sweep visits the
    // streams in sequence and returns the LSP-owned function symbols intact.
    const merged = mergeHighlightTokenLayers({
      lsp,
      textMate,
    });

    expect(merged?.tokens).toEqual(lsp.tokens);
  });

  it("preserves server-defined token names and modifiers", () => {
    const decoded = decodeLanguageServerSemanticTokens({
      data: [0, 2, 6, 0, 1],
      legend: {
        tokenTypes: ["concept"],
        tokenModifiers: ["documentation"],
      },
      languageId: "rust",
    });

    expect(decoded?.tokens[0]).toMatchObject({
      tokenType: "concept",
      modifiers: ["documentation"],
      captureCandidates: ["concept.documentation", "concept:rust", "concept"],
    });
  });
});
