import { useCallback, useRef, useState, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { type EditorSettings } from "@axon-editor/shared/settings";
import { isLargeDocumentModel } from "@axon-editor/shared/largeDocument";
import { writeFile } from "@axon-editor/renderer/shared/lib/api";
import { detectLanguageServerLanguage } from "../buffer/monacoModels";
import { toMonacoEdit } from "../formatting/editorDocumentHelpers";

interface EditorSaveOptions {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  editorSettings: EditorSettings;
  filePathRef: RefObject<string>;
  folderPath: string | null;
  readOnly: boolean;
}

export function useEditorSave({
  editorRef,
  editorSettings,
  filePathRef,
  folderPath,
  readOnly,
}: EditorSaveOptions) {
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveQueuedRef = useRef(false);

  const performSave = useCallback(async () => {
    const path = filePathRef.current;
    if (!path || readOnly) return;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.isDisposed()) return;

    try {
      const languageId = detectLanguageServerLanguage(path);
      if (
        editorSettings.formatOnSave &&
        folderPath &&
        !isLargeDocumentModel(model) &&
        languageId !== "plaintext"
      ) {
        try {
          const modelOptions = model.getOptions();
          // Formatting edits are computed against the exact text snapshot sent
          // to the language server. If typing continues during that round trip,
          // the returned ranges no longer target the same model version and must
          // be discarded instead of risking an edit against unrelated text.
          const versionBeforeFormat = model.getVersionId();
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath: path,
            languageId,
            content: editor.getValue(),
            tabSize: modelOptions?.tabSize ?? 2,
            insertSpaces: modelOptions?.insertSpaces ?? true,
          });
          const modelChangedDuringFormat =
            model.isDisposed() || versionBeforeFormat !== model.getVersionId();

          if (
            result.ok &&
            result.edits.length > 0 &&
            !modelChangedDuringFormat
          ) {
            const viewStateBeforeFormat = editor.saveViewState();
            // The shared Monaco model is formatted before the disk write so all
            // splits stay synchronized. Restoring the active editor view keeps
            // edits elsewhere in the file from turning Save into navigation.
            model.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
            if (viewStateBeforeFormat && !model.isDisposed()) {
              editor.restoreViewState(viewStateBeforeFormat);
            }
          } else if (
            result.ok &&
            result.edits.length > 0 &&
            modelChangedDuringFormat
          ) {
            console.warn(
              "skipped format-on-save edits: model changed during LSP round trip",
            );
          }
        } catch (err) {
          console.error("format on save failed:", err);
        }
      }

      const currentContent = editor.getValue();
      const savedAlternativeVersion = model.getAlternativeVersionId();
      await writeFile(path, currentContent, folderPath ?? path);
      window.dispatchEvent(
        new CustomEvent("axon:fileSaved", {
          detail: {
            path,
            content: isLargeDocumentModel(model) ? undefined : currentContent,
            alternativeVersionId: savedAlternativeVersion,
          },
        }),
      );
    } catch (err) {
      console.error(
        "save failed:",
        err instanceof Error ? err.message : "The file could not be saved.",
      );
    }
  }, [
    editorRef,
    editorSettings.formatOnSave,
    filePathRef,
    folderPath,
    readOnly,
  ]);

  const save = useCallback(() => {
    if (saveInFlightRef.current) {
      // Coalesce repeated shortcuts into one trailing save. The first operation
      // may still be formatting or writing an older snapshot; the trailing pass
      // guarantees text edited during it reaches disk after that work settles.
      saveQueuedRef.current = true;
      return saveInFlightRef.current;
    }

    setSaving(true);
    const task = (async () => {
      do {
        saveQueuedRef.current = false;
        await performSave();
      } while (saveQueuedRef.current);
    })().finally(() => {
      if (saveInFlightRef.current === task) {
        saveInFlightRef.current = null;
      }
      setSaving(false);
    });
    saveInFlightRef.current = task;
    return task;
  }, [performSave]);

  return { save, saving };
}
