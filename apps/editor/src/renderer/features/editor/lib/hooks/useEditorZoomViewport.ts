import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";

export function useEditorZoomViewport(
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>,
  fontSize: number,
  lineHeight: number,
) {
  const viewportRef = useRef({ scrollLeft: 0, scrollTop: 0 });
  const zoomRef = useRef({ fontSize, lineHeight });

  useLayoutEffect(() => {
    const previousZoom = zoomRef.current;
    zoomRef.current = { fontSize, lineHeight };
    if (
      previousZoom.fontSize === fontSize &&
      previousZoom.lineHeight === lineHeight
    ) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) return;
    const animationFrame = window.requestAnimationFrame(() => {
      editor.setScrollPosition(
        viewportRef.current,
        monaco.editor.ScrollType.Immediate,
      );
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [editorRef, fontSize, lineHeight]);

  return useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    viewportRef.current = {
      scrollLeft: editor.getScrollLeft(),
      scrollTop: editor.getScrollTop(),
    };
    editor.onDidScrollChange((event) => {
      viewportRef.current = {
        scrollLeft: event.scrollLeft,
        scrollTop: event.scrollTop,
      };
    });
  }, []);
}
