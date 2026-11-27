/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createEditorFormattingOptions } from "../../lib/formatting/editorFormattingOptions";

describe("editor formatting options", () => {
  it("enables visible and active indentation guides together", () => {
    expect(
      createEditorFormattingOptions({
        bracketPairGuidesEnabled: true,
        bracketPairHorizontalGuidesEnabled: true,
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
        bracketPairHorizontalGuidesEnabled: true,
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

  it("keeps vertical bracket guides when the horizontal rails are off", () => {
    expect(
      createEditorFormattingOptions({
        bracketPairGuidesEnabled: true,
        bracketPairHorizontalGuidesEnabled: false,
        codePaddingLeft: 10,
        highlightActiveIndentationGuide: true,
        indentationGuidesEnabled: true,
      }),
    ).toMatchObject({
      guides: {
        bracketPairs: true,
        bracketPairsHorizontal: false,
        highlightActiveBracketPair: true,
      },
    });
  });

  it("drops both bracket guide axes when bracket guides are off", () => {
    expect(
      createEditorFormattingOptions({
        bracketPairGuidesEnabled: false,
        bracketPairHorizontalGuidesEnabled: true,
        codePaddingLeft: 10,
        highlightActiveIndentationGuide: true,
        indentationGuidesEnabled: true,
      }),
    ).toMatchObject({
      guides: {
        bracketPairs: false,
        bracketPairsHorizontal: false,
      },
    });
  });

  it("keeps the horizontal rails off when hot reload has no value yet", () => {
    const settings = {
      bracketPairGuidesEnabled: true,
      bracketPairHorizontalGuidesEnabled: true,
      codePaddingLeft: 10,
      highlightActiveIndentationGuide: true,
      indentationGuidesEnabled: true,
    };
    delete (settings as Partial<typeof settings>)
      .bracketPairHorizontalGuidesEnabled;

    expect(createEditorFormattingOptions(settings)).toMatchObject({
      guides: {
        bracketPairs: true,
        bracketPairsHorizontal: false,
      },
    });
  });
});
