import { useEffect, useRef, useState, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { isLargeDocumentModel } from "@axon-editor/shared/largeDocument";
import { registerExternalLanguageToolFile } from "@axon-editor/services/lsp/renderer/lspFileAccess";
import { preloadTextMateLanguage } from "@axon-editor/services/lsp/renderer/textMateSemanticTokens";
import { loadAxonBuffer } from "./axonBufferLoader";
import {
  acquireExistingModel,
  acquireModel,
  detectLanguage,
  getModel,
  getModelMetadata,
  isModelMarkedDirty,
  markModelDirty,
  releaseModel,
  setModelMetadata,
  updateModel,
} from "./monacoModels";

interface AxonBufferDocumentOptions {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  filePath: string;
  filePathRef: RefObject<string>;
  folderPath: string | null;
  onDirtyChange: (path: string, dirty: boolean) => void;
  recordLoadedDiskContent: (
    model: monaco.editor.ITextModel,
    content: string,
  ) => boolean;
  recordSynchronizedDiskContent: (
    model: monaco.editor.ITextModel,
    content: string,
  ) => void;
  refreshAfterAttachRef: RefObject<() => void>;
}

function initialDocumentState(filePath: string) {
  const model = getModel(filePath);
  const metadata = getModelMetadata(filePath);
  const largeDocument = model ? isLargeDocumentModel(model) : false;
  return {
    error: null as string | null,
    largeDocument,
    liveContent: model && !largeDocument ? model.getValue() : "",
    loading: !model,
    readOnly: metadata?.readOnly ?? false,
  };
}

export function useAxonBufferDocument(options: AxonBufferDocumentOptions) {
  const [state, setState] = useState(() =>
    initialDocumentState(options.filePath),
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    let acquiredModel = acquireExistingModel(options.filePath);
    let hasAcquiredReference = Boolean(acquiredModel);

    setState((current) => {
      if (!acquiredModel) {
        return {
          ...current,
          error: null,
          largeDocument: false,
          liveContent: "",
          loading: true,
          readOnly: false,
        };
      }
      const metadata = getModelMetadata(options.filePath);
      const largeDocument = isLargeDocumentModel(acquiredModel);
      return {
        error: null,
        largeDocument,
        liveContent: largeDocument ? "" : acquiredModel.getValue(),
        loading: false,
        readOnly: metadata?.readOnly ?? false,
      };
    });
    void preloadTextMateLanguage(detectLanguage(options.filePath));

    loadAxonBuffer(options.filePath, options.folderPath)
      .then((file) => {
        if (cancelled) return;

        if (!acquiredModel) {
          acquiredModel = acquireModel(options.filePath, file.content);
          hasAcquiredReference = true;
        } else if (!isModelMarkedDirty(options.filePath)) {
          // A retained clean buffer is painted immediately, then reconciled
          // against the validated disk snapshot. Dirty buffers are never
          // overwritten here because they may contain edits that exist only in
          // Monaco and have not reached disk yet.
          updateModel(options.filePath, file.content);
        }

        setModelMetadata(options.filePath, {
          external: file.external,
          readOnly: file.readOnly,
        });
        if (file.external) registerExternalLanguageToolFile(file.path);

        const model = acquiredModel;
        const largeDocument = isLargeDocumentModel(model);
        const dirty = optionsRef.current.recordLoadedDiskContent(
          model,
          file.content,
        );
        markModelDirty(options.filePath, dirty);
        optionsRef.current.onDirtyChange(options.filePath, dirty);
        setState({
          error: null,
          largeDocument,
          liveContent: largeDocument ? "" : model.getValue(),
          loading: false,
          readOnly: file.readOnly,
        });

        if (optionsRef.current.editorRef.current && !model.isDisposed()) {
          optionsRef.current.editorRef.current.setModel(model);
          window.requestAnimationFrame(() =>
            optionsRef.current.refreshAfterAttachRef.current(),
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled || acquiredModel) return;
        setState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "The file could not be opened.",
          loading: false,
        }));
      });

    const cleanupFileWatcher = window.axon.onFileChanged(
      ({ path, content }) => {
        if (path !== optionsRef.current.filePathRef.current) return;
        if (isModelMarkedDirty(options.filePath)) return;
        updateModel(options.filePath, content);
        const model = getModel(options.filePath);
        if (!model || model.isDisposed()) return;

        const largeDocument = isLargeDocumentModel(model);
        optionsRef.current.recordSynchronizedDiskContent(model, content);
        markModelDirty(options.filePath, false);
        optionsRef.current.onDirtyChange(options.filePath, false);
        setState((current) => ({
          ...current,
          largeDocument,
          liveContent: largeDocument ? "" : content,
        }));
        window.requestAnimationFrame(() =>
          optionsRef.current.refreshAfterAttachRef.current(),
        );
      },
    );

    return () => {
      cancelled = true;
      cleanupFileWatcher();
      if (hasAcquiredReference) releaseModel(options.filePath);
    };
  }, [options.filePath, options.folderPath]);

  return {
    ...state,
    setLargeDocument: (largeDocument: boolean) =>
      setState((current) => ({ ...current, largeDocument })),
    setLiveContent: (liveContent: string | ((current: string) => string)) =>
      setState((current) => ({
        ...current,
        liveContent:
          typeof liveContent === "function"
            ? liveContent(current.liveContent)
            : liveContent,
      })),
  };
}
