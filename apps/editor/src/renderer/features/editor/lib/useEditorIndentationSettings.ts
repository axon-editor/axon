import { useEffect, type RefObject } from "react";
import type * as monaco from "monaco-editor";
import { type EditorSettings } from "../../../../shared/settings";
import { createEditorFormattingOptions } from "./editorFormattingOptions";

export function useEditorIndentationSettings(
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>,
  editorSettings: EditorSettings,
  editorReadyNonce: number,
  loading: boolean,
) {
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model || model.isDisposed()) return;

    // I update the mounted Monaco instance directly because
    // @monaco-editor/react applies construction options reliably on mount, but
    // Monaco owns the live editor afterward. This keeps Settings previews and
    // saved values working without recreating the current tab or window.
    editor.updateOptions(createEditorFormattingOptions(editorSettings));

    // I apply indentation to the shared text model because Monaco does not
    // store it on an individual editor widget. This keeps split panes
    // consistent and prevents file detection from overriding a fixed tab width.
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
    editorSettings.bracketPairGuidesEnabled,
    editorSettings.codePaddingLeft,
    editorSettings.highlightActiveIndentationGuide,
    editorSettings.indentationGuidesEnabled,
    editorSettings.insertSpaces,
    editorSettings.tabSize,
    loading,
  ]);
}
