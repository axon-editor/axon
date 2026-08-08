import { useCallback, useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { isLargeDocumentModel } from "../../../../shared/largeDocument";

interface Options {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePathRef: RefObject<string>;
  onDirtyChange: (path: string, dirty: boolean) => void;
}

interface FileSavedDetail {
  path?: string;
  content?: string;
  alternativeVersionId?: number;
}

export function useEditorDiskBaseline({
  editorRef,
  filePathRef,
  onDirtyChange,
}: Options) {
  const diskContentRef = useRef<string | null>("");
  const savedAlternativeVersionRef = useRef<number | null>(null);

  const recordLoadedDiskContent = useCallback(
    (model: monaco.editor.ITextModel, content: string) => {
      const largeDocument = isLargeDocumentModel(model);
      diskContentRef.current = largeDocument ? null : content;
      const modelMatchesDisk =
        model.getValueLength() === content.length &&
        model.getValue() === content;
      savedAlternativeVersionRef.current = modelMatchesDisk
        ? model.getAlternativeVersionId()
        : null;
      return !modelMatchesDisk;
    },
    [],
  );

  const recordSynchronizedDiskContent = useCallback(
    (model: monaco.editor.ITextModel, content: string) => {
      diskContentRef.current = isLargeDocumentModel(model) ? null : content;
      savedAlternativeVersionRef.current = model.getAlternativeVersionId();
    },
    [],
  );

  const isModelDirty = useCallback((model: monaco.editor.ITextModel) => {
    const savedAlternativeVersion = savedAlternativeVersionRef.current;
    if (savedAlternativeVersion !== null) {
      return model.getAlternativeVersionId() !== savedAlternativeVersion;
    }

    // A second pane can acquire a shared Monaco model that already contains
    // unsaved edits. There is no saved alternative-version marker for that
    // state, so only this uncommon path compares text. Normal typing uses the
    // O(1) version check above instead of copying the entire document per key.
    return (
      diskContentRef.current === null ||
      model.getValue() !== diskContentRef.current
    );
  }, []);

  useEffect(() => {
    const handleFileSaved = (event: Event) => {
      const saveEvent = event as CustomEvent<FileSavedDetail>;
      if (saveEvent.detail?.path !== filePathRef.current) return;

      const model = editorRef.current?.getModel();
      if (!model || model.isDisposed()) return;
      const savedVersion = saveEvent.detail.alternativeVersionId;
      const contentStayedCurrent =
        savedVersion === undefined ||
        model.getAlternativeVersionId() === savedVersion;

      // A disk write can finish after the user has typed another edit. The
      // event carries the exact content and Monaco version written to disk so
      // that later text remains dirty instead of being incorrectly marked as
      // saved by an asynchronous write completion.
      diskContentRef.current = isLargeDocumentModel(model)
        ? null
        : (saveEvent.detail.content ?? model.getValue());
      savedAlternativeVersionRef.current = contentStayedCurrent
        ? model.getAlternativeVersionId()
        : null;
      onDirtyChange(filePathRef.current, !contentStayedCurrent);
    };

    window.addEventListener("axon:fileSaved", handleFileSaved);
    return () => window.removeEventListener("axon:fileSaved", handleFileSaved);
  }, [editorRef, filePathRef, onDirtyChange]);

  return {
    isModelDirty,
    recordLoadedDiskContent,
    recordSynchronizedDiskContent,
  };
}
