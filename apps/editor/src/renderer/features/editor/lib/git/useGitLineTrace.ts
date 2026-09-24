/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

// One resolved blame result carries a record per line (commit hash, author,
// date), so every entry is worth hundreds of bytes to megabytes depending on
// file size. Line-trace is on by default and adds an entry for each repository
// file the cursor visits, which means an unbounded map pins the blame history
// of every file seen across a whole day. Capping it as an LRU keeps small
// files hot; a revisited file re-issues the request and moves to the back.
const BLAME_CACHE_MAX_ENTRIES = 256;

function cacheBlame(key: string, pending: Promise<GitBlameResult>) {
  blameCache.delete(key);
  blameCache.set(key, pending);
  while (blameCache.size > BLAME_CACHE_MAX_ENTRIES) {
    const oldestKey = blameCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    blameCache.delete(oldestKey);
  }
}

function cacheKey(folderPath: string, filePath: string) {
  return `${folderPath}\0${filePath}`;
}

interface Options {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  editorReadyNonce: number;
  enabled: boolean;
  filePath: string;
  folderPath: string | null;
  isRepository: boolean;
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
  isRepository,
  loading,
  visible,
}: Options) {
  const blameLinesRef = useRef<Map<number, GitBlameLine>>(new Map());
  const blameMessagesRef = useRef<Record<string, string>>({});
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
    current.popover.update(blameLine, blameMessagesRef.current);
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
      !folderPath ||
      // Blame only exists for files inside a Git repository. The active folder's
      // repository state comes from git:status (the same single source the
      // Source Control view uses), so outside a repo we never even issue the
      // git:blame request. This mirrors how Zed gates blame to buffers with an
      // attached repository instead of asking Git and swallowing an error.
      !isRepository
    ) {
      requestRef.current += 1;
      blameLinesRef.current.clear();
      blameMessagesRef.current = {};
      clearWidget();
      return;
    }

    const key = cacheKey(folderPath, filePath);
    const request = ++requestRef.current;
    staleRef.current = false;
    const pending =
      blameCache.get(key) ?? window.axon.getGitBlame(folderPath, filePath);
    cacheBlame(key, pending);

    void pending
      .then((result) => {
        if (request !== requestRef.current) return;
        blameLinesRef.current = new Map(
          result.lines.map((line) => [line.lineNumber, line]),
        );
        blameMessagesRef.current = result.messages;
        paintCurrentLine();
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        blameCache.delete(key);
        blameLinesRef.current.clear();
        blameMessagesRef.current = {};
        clearWidget();
      });
  }, [
    clearWidget,
    editorRef,
    enabled,
    filePath,
    folderPath,
    isRepository,
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
