import * as monaco from "monaco-editor";
import { type LanguageServerTextEdit } from "../../../shared/lsp";

export function toMonacoEdit(edit: LanguageServerTextEdit) {
  return {
    range: new monaco.Range(
      edit.range.start.line + 1,
      edit.range.start.character + 1,
      edit.range.end.line + 1,
      edit.range.end.character + 1,
    ),
    text: edit.newText,
    forceMoveMarkers: true,
  };
}
