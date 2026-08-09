import { describe, expect, it } from "vitest";
import { createEditorFormattingOptions } from "../../lib/formatting/editorFormattingOptions";

describe("editor formatting options", () => {
  it("enables visible and active indentation guides together", () => {
    expect(
      createEditorFormattingOptions({
        bracketPairGuidesEnabled: true,
        codePaddingLeft: 10,
        highlightActiveIndentationGuide: true,
        indentationGuidesEnabled: true,
      }),
    ).toMatchObject({
      guides: {
        bracketPairs: true,
        bracketPairsHorizontal: true,
        highlightActiveBracketPair: true,
        highlightActiveIndentation: "always",
        indentation: true,
      },
    });
  });

  it("keeps only the active bracket scope when indentation guides are hidden", () => {
    expect(
      createEditorFormattingOptions({
        bracketPairGuidesEnabled: true,
        codePaddingLeft: 26,
        highlightActiveIndentationGuide: true,
        indentationGuidesEnabled: false,
      }),
    ).toEqual({
      guides: {
        bracketPairs: "active",
        bracketPairsHorizontal: "active",
        highlightActiveBracketPair: true,
        highlightActiveIndentation: false,
        indentation: false,
      },
      lineDecorationsWidth: 26,
    });
  });
});
