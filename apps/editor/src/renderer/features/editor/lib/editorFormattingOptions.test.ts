import { describe, expect, it } from "vitest";
import { createEditorFormattingOptions } from "./editorFormattingOptions";

describe("editor formatting options", () => {
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
