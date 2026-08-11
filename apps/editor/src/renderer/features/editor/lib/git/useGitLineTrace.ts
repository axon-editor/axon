import { useCallback, useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import {
  type GitBlameLine,
  type GitBlameResult,
} from "@axon-editor/shared/git";
import { createLineTraceLabel } from "./lineTrace";
import {
  createLineTracePopover,
  type LineTracePopover,
} from "./lineTracePopover";
import { isLargeDocumentModel } from "@axon-editor/shared/largeDocument";

const blameCache = new Map<string, Promise<GitBlameResult>>();

function cacheKey(folderPath: string, filePath: string) {
  return `${folderPath}\0${filePath}`;
}

interface Options {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  editorReadyNonce: number;
  enabled: boolean;
  filePath: string;
  folderPath: string | null;
  loading: boolean;
  visible: boolean;
}

interface LineTraceWidgetState {
  added: boolean;
  domNode: HTMLSpanElement;
  popover: LineTracePopover;
  position: {
    column: number;
    lineNumber: number;
  };
  widget: monaco.editor.IContentWidget;
}

export default function useGitLineTrace({
  editorRef,
  editorReadyNonce,
  enabled,
  filePath,
  folderPath,
  loading,
  visible,
}: Options) {
  const blameLinesRef = useRef<Map<number, GitBlameLine>>(new Map());
  const widgetRef = useRef<LineTraceWidgetState | null>(null);
  const requestRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const staleRef = useRef(false);

  const clearWidget = useCallback(() => {
    const editor = editorRef.current;
    const current = widgetRef.current;
    if (!current) return;
    current.popover.hide();
    if (!current.added || !editor) return;
    editor.removeContentWidget(current.widget);
    current.added = false;
  }, [editorRef]);

  const getWidget = useCallback(() => {
    if (widgetRef.current) return widgetRef.current;
    const domNode = document.createElement("span");
    domNode.className = "axon-line-trace";
    const popover = createLineTracePopover(domNode);
    const position = {
      column: 1,
      lineNumber: 1,
    };
    const widget: monaco.editor.IContentWidget = {
      allowEditorOverflow: false,
      getDomNode: () => domNode,
      getId: () => "axon.lineTrace",
      getPosition: () => ({
        position,
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    };
    const state: LineTraceWidgetState = {
      added: false,
      domNode,
      popover,
      position,
      widget,
    };
    widgetRef.current = state;
    return state;
  }, []);

  const paintCurrentLine = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (
      !enabled ||
      !visible ||
      staleRef.current ||
      !editor ||
      !model ||
      !position
    ) {
      clearWidget();
      return;
    }

    const blameLine = blameLinesRef.current.get(position.lineNumber);
    if (!blameLine) {
      clearWidget();
      return;
    }

    const lineNumber = position.lineNumber;
    const endColumn = model.getLineMaxColumn(lineNumber);
    const current = getWidget();
    if (
      current.position.lineNumber !== lineNumber ||
      current.position.column !== endColumn
    ) {
      current.popover.hide();
    }
    current.position.lineNumber = lineNumber;
    current.position.column = endColumn;
    current.domNode.textContent = createLineTraceLabel(blameLine);
    current.domNode.style.fontFamily = editor.getOption(
      monaco.editor.EditorOption.fontInfo,
    ).fontFamily;
    current.popover.update(blameLine);
    if (!current.added) {
      editor.addContentWidget(current.widget);
      current.added = true;
    }
    editor.layoutContentWidget(current.widget);
  }, [clearWidget, editorRef, enabled, getWidget, visible]);

  const loadBlame = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (
      !enabled ||
      !visible ||
      loading ||
      !model ||
      isLargeDocumentModel(model) ||
      !folderPath
    ) {
      requestRef.current += 1;
      blameLinesRef.current.clear();
      clearWidget();
      return;
    }

    const key = cacheKey(folderPath, filePath);
    const request = ++requestRef.current;
    staleRef.current = false;
    const pending =
      blameCache.get(key) ?? window.axon.getGitBlame(folderPath, filePath);
    blameCache.set(key, pending);

    void pending
      .then((result) => {
        if (request !== requestRef.current) return;
        blameLinesRef.current = new Map(
          result.lines.map((line) => [line.lineNumber, line]),
        );
        paintCurrentLine();
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        blameCache.delete(key);
        blameLinesRef.current.clear();
        clearWidget();
      });
  }, [
    clearWidget,
    editorRef,
    enabled,
    filePath,
    folderPath,
    loading,
    paintCurrentLine,
    visible,
  ]);

  useEffect(() => {
    loadBlame();
  }, [editorReadyNonce, loadBlame]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      paintCurrentLine();
    });
    const contentDisposable = editor.onDidChangeModelContent(() => {
      staleRef.current = true;
      clearWidget();
    });
    return () => {
      cursorDisposable.dispose();
      contentDisposable.dispose();
    };
  }, [clearWidget, editorReadyNonce, editorRef, paintCurrentLine]);

  useEffect(() => {
    if (!folderPath) return;
    const key = cacheKey(folderPath, filePath);
    const refresh = () => {
      blameCache.delete(key);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        loadBlame();
      }, 120);
    };
    const cleanupGit = window.axon.onGitChanged((event) => {
      if (event?.folderPath && event.folderPath !== folderPath) return;
      if (
        event?.paths?.length &&
        !event.paths.some((changedPath) => changedPath === filePath)
      ) {
        return;
      }
      refresh();
    });
    const handleSaved = (event: Event) => {
      const saved = event as CustomEvent<{ path?: string }>;
      if (saved.detail?.path !== filePath) return;
      refresh();
    };
    window.addEventListener("axon:fileSaved", handleSaved);
    return () => {
      cleanupGit();
      window.removeEventListener("axon:fileSaved", handleSaved);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [filePath, folderPath, loadBlame]);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      clearWidget();
      widgetRef.current?.popover.dispose();
      widgetRef.current = null;
    };
  }, [clearWidget]);
}
