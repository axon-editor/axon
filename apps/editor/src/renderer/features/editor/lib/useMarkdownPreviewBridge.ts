import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as monaco from "monaco-editor";
import {
  onMarkdownScroll,
  publishMarkdownScroll,
} from "@axon-builtin-markdown/lib/markdownPreviewSync";

interface UseMarkdownPreviewBridgeOptions {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  isMarkdown: boolean;
  setLiveContent: Dispatch<SetStateAction<string>>;
}

export function useMarkdownPreviewBridge({
  editorRef,
  filePath,
  isMarkdown,
  setLiveContent,
}: UseMarkdownPreviewBridgeOptions) {
  const suppressEditorScrollRef = useRef(false);

  useEffect(() => {
    if (!isMarkdown) return;
    return onMarkdownScroll((event) => {
      if (event.filePath !== filePath || event.source !== "preview") return;
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || model.isDisposed()) return;

      suppressEditorScrollRef.current = true;
      editor.setScrollTop(
        editor.getTopForLineNumber(
          Math.max(1, Math.min(event.line, model.getLineCount())),
        ),
        monaco.editor.ScrollType.Immediate,
      );
      window.requestAnimationFrame(() => {
        suppressEditorScrollRef.current = false;
      });
    });
  }, [editorRef, filePath, isMarkdown]);

  const trackEditorScroll = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) =>
      editor.onDidScrollChange((event) => {
        if (
          !isMarkdown ||
          !event.scrollTopChanged ||
          suppressEditorScrollRef.current
        ) {
          return;
        }
        const firstVisibleLine = editor.getVisibleRanges()[0]?.startLineNumber;
        if (firstVisibleLine) {
          publishMarkdownScroll({
            filePath,
            line: firstVisibleLine,
            source: "editor",
          });
        }
      }),
    [filePath, isMarkdown],
  );

  const updateMarkdownContent = useCallback(
    (nextContent: string) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (
        !editor ||
        !model ||
        model.isDisposed() ||
        model.getValue() === nextContent
      ) {
        return;
      }

      // executeEdits records the checkbox toggle in Monaco's undo stack and
      // then lets the normal model-change pipeline update dirty state, LSP
      // documents, Git decorations, and every split sharing this model.
      editor.pushUndoStop();
      editor.executeEdits("axon.markdown.toggleTask", [
        { range: model.getFullModelRange(), text: nextContent },
      ]);
      editor.pushUndoStop();
      setLiveContent(nextContent);
    },
    [editorRef, setLiveContent],
  );

  return { trackEditorScroll, updateMarkdownContent };
}
