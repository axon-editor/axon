import type * as monaco from "monaco-editor";
import type { EditorSettings } from "../../../../shared/settings";

type EditorFormattingSettings = Pick<
  EditorSettings,
  | "bracketPairGuidesEnabled"
  | "codePaddingLeft"
  | "highlightActiveIndentationGuide"
  | "indentationGuidesEnabled"
>;

export function createEditorFormattingOptions(
  settings: EditorFormattingSettings,
): monaco.editor.IEditorOptions {
  const bracketGuidesVisible = settings.bracketPairGuidesEnabled
    ? settings.indentationGuidesEnabled
      ? true
      : "active"
    : false;

  // I use Monaco's active-only bracket mode when normal indentation guides are
  // hidden. This removes the permanent vertical rails while preserving the
  // current function or block boundary from its opening bracket to its close.
  return {
    guides: {
      indentation: settings.indentationGuidesEnabled,
      highlightActiveIndentation:
        settings.indentationGuidesEnabled &&
        settings.highlightActiveIndentationGuide,
      bracketPairs: bracketGuidesVisible,
      bracketPairsHorizontal: bracketGuidesVisible,
      highlightActiveBracketPair: settings.bracketPairGuidesEnabled,
    },
    lineDecorationsWidth: settings.codePaddingLeft,
  };
}
