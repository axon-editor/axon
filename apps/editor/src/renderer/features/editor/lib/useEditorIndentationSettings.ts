import { useEffect, type RefObject } from "react";
import type * as monaco from "monaco-editor";
import { type EditorSettings } from "../../../../shared/settings";

export function useEditorIndentationSettings(
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>,
  editorSettings: EditorSettings,
  editorReadyNonce: number,
  loading: boolean,
) {
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model || model.isDisposed()) return;

    // Monaco stores indentation on the shared text model rather than on one
    // visible editor widget. Applying the preference at this boundary keeps
    // split panes consistent and prevents file detection from silently winning
    // after the user has selected a fixed tab width.
    if (editorSettings.detectIndentation) {
      model.detectIndentation(
        editorSettings.insertSpaces,
        editorSettings.tabSize,
      );
      return;
    }

    model.updateOptions({
      tabSize: editorSettings.tabSize,
      indentSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
    });
  }, [
    editorReadyNonce,
    editorRef,
    editorSettings.detectIndentation,
    editorSettings.insertSpaces,
    editorSettings.tabSize,
    loading,
  ]);
}
