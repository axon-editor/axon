import { useCallback, useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { type GitBlameLine, type GitBlameResult } from "../../../../shared/git";
import { createLineTraceHover, createLineTraceLabel } from "./lineTrace";

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
  const collectionRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const requestRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const staleRef = useRef(false);

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
      collectionRef.current?.clear();
      return;
    }

    const blameLine = blameLinesRef.current.get(position.lineNumber);
    if (!blameLine) {
      collectionRef.current?.clear();
      return;
    }

    const lineNumber = position.lineNumber;
    const endColumn = model.getLineMaxColumn(lineNumber);
    collectionRef.current ??= editor.createDecorationsCollection();
    collectionRef.current.set([
      {
        range: new monaco.Range(lineNumber, endColumn, lineNumber, endColumn),
        options: {
          hoverMessage: {
            value: createLineTraceHover(blameLine),
          },
          after: {
            content: createLineTraceLabel(blameLine),
            inlineClassName: "axon-line-trace",
            inlineClassNameAffectsLetterSpacing: true,
            cursorStops: monaco.editor.InjectedTextCursorStops.None,
          },
        },
      },
    ]);
  }, [editorRef, enabled, visible]);

  const loadBlame = useCallback(
    () => {
      const editor = editorRef.current;
      if (
        !enabled ||
        !visible ||
        loading ||
        !editor?.getModel() ||
        !folderPath
      ) {
        requestRef.current += 1;
        blameLinesRef.current.clear();
        collectionRef.current?.clear();
        return;
      }

      const key = cacheKey(folderPath, filePath);
      const request = ++requestRef.current;
      staleRef.current = false;
      blameLinesRef.current.clear();
      collectionRef.current?.clear();
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
          collectionRef.current?.clear();
        });
    }, [editorRef, enabled, filePath, folderPath, loading, paintCurrentLine, visible]);

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
      collectionRef.current?.clear();
    });
    return () => {
      cursorDisposable.dispose();
      contentDisposable.dispose();
    };
  }, [editorReadyNonce, editorRef, paintCurrentLine]);

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
      collectionRef.current?.clear();
      collectionRef.current = null;
    };
  }, []);
}
