import { describe, expect, it } from "vitest";

import { LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES } from "../../../shared/lsp";
import { mergeSemanticTokenLayers } from "./semanticTokenMerge";

interface TestToken {
  line: number;
  character: number;
  length: number;
  type: (typeof LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES)[number];
}

function encodeTokens(tokens: TestToken[]) {
  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  for (const token of tokens) {
    const deltaLine = token.line - previousLine;
    data.push(
      deltaLine,
      deltaLine === 0 ? token.character - previousCharacter : token.character,
      token.length,
      LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES.indexOf(token.type),
      0,
    );
    previousLine = token.line;
    previousCharacter = token.character;
  }

  return data;
}

describe("semantic token layer merging", () => {
  it("keeps grammar-owned structure over a weaker LSP classification", () => {
    const textMate = encodeTokens([
      { line: 0, character: 0, length: 5, type: "keyword" },
    ]);
    const merged = mergeSemanticTokenLayers({
      lsp: encodeTokens([
        { line: 0, character: 0, length: 5, type: "variable" },
      ]),
      textMate: { data: Uint32Array.from(textMate) },
    });

    expect(Array.from(merged?.data ?? [])).toEqual(textMate);
  });

  it("keeps project-aware symbols over a weaker grammar classification", () => {
    const lsp = encodeTokens([
      { line: 0, character: 0, length: 8, type: "function" },
    ]);
    const merged = mergeSemanticTokenLayers({
      lsp,
      textMate: {
        data: Uint32Array.from(
          encodeTokens([
            { line: 0, character: 0, length: 8, type: "variable" },
          ]),
        ),
      },
    });

    expect(Array.from(merged?.data ?? [])).toEqual(lsp);
  });

  it("preserves non-overlapping tokens from both sources in document order", () => {
    const expected = encodeTokens([
      { line: 0, character: 0, length: 3, type: "keyword" },
      { line: 0, character: 4, length: 8, type: "function" },
    ]);
    const merged = mergeSemanticTokenLayers({
      lsp: encodeTokens([
        { line: 0, character: 4, length: 8, type: "function" },
      ]),
      textMate: {
        data: Uint32Array.from(
          encodeTokens([{ line: 0, character: 0, length: 3, type: "keyword" }]),
        ),
      },
    });

    expect(Array.from(merged?.data ?? [])).toEqual(expected);
  });

  it("merges large token streams without comparing every token pair", () => {
    const tokenCount = 20_000;
    const lsp = encodeTokens(
      Array.from({ length: tokenCount }, (_, line) => ({
        line,
        character: 0,
        length: 8,
        type: "function" as const,
      })),
    );
    const textMate = encodeTokens(
      Array.from({ length: tokenCount }, (_, line) => ({
        line,
        character: 0,
        length: 8,
        type: "variable" as const,
      })),
    );

    // This fixture represents a large source file with one overlapping token
    // from each source on every line. A pairwise merge performs 400 million
    // overlap checks here and blocks the renderer; the ordered sweep visits the
    // streams in sequence and returns the LSP-owned function symbols intact.
    const merged = mergeSemanticTokenLayers({
      lsp,
      textMate: { data: Uint32Array.from(textMate) },
    });

    expect(Array.from(merged?.data ?? [])).toEqual(lsp);
  });
});
