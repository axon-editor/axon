import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as monaco from "monaco-editor";

interface UseEditorFindOptions {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePathRef: MutableRefObject<string>;
  liveContent: string;
  loading: boolean;
  visible: boolean;
  setPreviewMode: (mode: "editor") => void;
}

export function useEditorFind({
  editorRef,
  filePathRef,
  liveContent,
  loading,
  visible,
  setPreviewMode,
}: UseEditorFindOptions) {
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const findDecorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const shouldRevealFindMatchRef = useRef(false);

  const clearFindDecorations = useCallback(() => {
    findDecorationsRef.current?.clear();
  }, []);

  const updateFindDecorations = useCallback(
    (
      query: string,
      nextIndex = findIndex,
      options: { revealActiveMatch?: boolean } = {},
    ) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || !query.trim()) {
        findDecorationsRef.current?.clear();
        setFindMatchCount(0);
        setFindIndex(0);
        return;
      }

      const matches = model.findMatches(
        query,
        true,
        false,
        false,
        null,
        true,
      );
      setFindMatchCount(matches.length);
      if (matches.length === 0) {
        findDecorationsRef.current?.clear();
        setFindIndex(0);
        return;
      }

      const clampedIndex = Math.max(0, Math.min(nextIndex, matches.length - 1));
      setFindIndex(clampedIndex);
      findDecorationsRef.current ??= editor.createDecorationsCollection();
      findDecorationsRef.current.set(
        matches.map((match, index) => ({
          range: match.range,
          options: {
            className:
              index === clampedIndex
                ? "axon-find-match axon-find-match--active"
                : "axon-find-match",
            inlineClassName:
              index === clampedIndex
                ? "axon-find-match-inline axon-find-match-inline--active"
                : "axon-find-match-inline",
          },
        })),
      );

      if (options.revealActiveMatch) {
        // Typing in the find input should update highlights without taking the
        // user's editor cursor away from the place they were editing. Navigation
        // is a separate intent: Enter, Shift+Enter, or the next/previous buttons
        // set this flag so only those actions move the Monaco selection and
        // reveal the active match.
        editor.setSelection(matches[clampedIndex].range);
        editor.revealRangeInCenter(
          matches[clampedIndex].range,
          monaco.editor.ScrollType.Smooth,
        );
      }
    },
    [editorRef, findIndex],
  );

  const openFind = useCallback(() => {
    setPreviewMode("editor");
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (model && selection && !selection.isEmpty()) {
      const selectedText = model.getValueInRange(selection);
      if (selectedText && !selectedText.includes("\n")) {
        setFindQuery(selectedText);
        setFindIndex(0);
      }
    }

    setFindOpen(true);
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, [editorRef, setPreviewMode]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    findDecorationsRef.current?.clear();
    editorRef.current?.focus();
  }, [editorRef]);

  const moveFindSelection = useCallback(
    (direction: 1 | -1) => {
      if (findMatchCount === 0) return;
      shouldRevealFindMatchRef.current = true;
      setFindIndex((index) => {
        const nextIndex = (index + direction + findMatchCount) % findMatchCount;
        if (nextIndex === index) {
          window.requestAnimationFrame(() => {
            updateFindDecorations(findQuery, nextIndex, {
              revealActiveMatch: true,
            });
          });
        }
        return nextIndex;
      });
    },
    [findMatchCount, findQuery, updateFindDecorations],
  );

  const changeFindQuery = useCallback((query: string) => {
    setFindQuery(query);
    setFindIndex(0);
  }, []);

  useEffect(() => {
    if (!findOpen) {
      findDecorationsRef.current?.clear();
      return;
    }

    const revealActiveMatch = shouldRevealFindMatchRef.current;
    shouldRevealFindMatchRef.current = false;
    updateFindDecorations(findQuery, findIndex, { revealActiveMatch });
  }, [findIndex, findOpen, findQuery, liveContent, updateFindDecorations]);

  useEffect(() => {
    const handleOpenFind = (event: Event) => {
      const findEvent = event as CustomEvent<{ path?: string }>;
      if (!visible || loading) return;
      if (findEvent.detail?.path && findEvent.detail.path !== filePathRef.current) {
        return;
      }

      // The global shortcut layer cannot know which Monaco instance owns the
      // active file, especially with split panes and preview/editor toggles.
      // The visible SingleEditor handles the event locally so Cmd/Ctrl+F works
      // from toolbar/sidebar focus without opening duplicate find widgets in
      // hidden panes.
      openFind();
    };

    window.addEventListener("axon:openFind", handleOpenFind);
    return () => window.removeEventListener("axon:openFind", handleOpenFind);
  }, [filePathRef, loading, openFind, visible]);

  return {
    changeFindQuery,
    clearFindDecorations,
    closeFind,
    findIndex,
    findInputRef,
    findMatchCount,
    findOpen,
    findQuery,
    moveFindSelection,
    openFind,
  };
}
