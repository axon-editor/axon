import { useCallback, type Dispatch, type SetStateAction } from "react";
import { writeFile } from "../../../renderer/shared/lib/api";
import {
  detectLanguageServerLanguage,
  getModel,
} from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { type Layout } from "../../../renderer/features/editor/lib/layout/types";
import { toMonacoEdit } from "./monacoEdit";

type OutputLevel = "info" | "success" | "warning" | "error";

interface SaveFileFromModelOptions {
  appendOutput: (source: string, message: string, level?: OutputLevel) => void;
  folderPath: string | null;
  formatOnSave: boolean;
  setLayout: Dispatch<SetStateAction<Layout>>;
  workspaceTrusted: boolean;
}

export function useSaveFileFromModel({
  appendOutput,
  folderPath,
  formatOnSave,
  setLayout,
  workspaceTrusted,
}: SaveFileFromModelOptions) {
  return useCallback(
    async (filePath: string, options: { announce?: boolean } = {}) => {
      const model = getModel(filePath);
      if (!model || model.isDisposed()) return false;
      const languageId = detectLanguageServerLanguage(filePath);

      if (
        formatOnSave &&
        folderPath &&
        workspaceTrusted &&
        languageId !== "plaintext"
      ) {
        try {
          const modelOptions = model.getOptions();
          const versionBeforeFormat = model.getVersionId();
          const result = await window.axon.formatLanguageServerDocument({
            folderPath,
            filePath,
            languageId,
            content: model.getValue(),
            tabSize: modelOptions.tabSize,
            insertSpaces: modelOptions.insertSpaces,
          });
          const modelChangedDuringFormat =
            model.isDisposed() || versionBeforeFormat !== model.getVersionId();

          if (result.ok && result.edits.length > 0 && !modelChangedDuringFormat) {
            // Formatting updates the shared Monaco model before the disk write
            // so split panes and the saved file cannot diverge. The version
            // check protects edits typed while the formatter request was in
            // flight from receiving ranges computed against older text.
            model.pushEditOperations(
              [],
              result.edits.map(toMonacoEdit),
              () => null,
            );
          } else if (
            result.ok &&
            result.edits.length > 0 &&
            modelChangedDuringFormat
          ) {
            appendOutput(
              "lsp",
              "Skipped format-on-save because the file changed while formatting.",
              "warning",
            );
          } else if (!result.ok && result.message) {
            appendOutput("lsp", result.message, "warning");
          }
        } catch (error) {
          appendOutput(
            "lsp",
            error instanceof Error ? error.message : "Format on save failed.",
            "warning",
          );
        }
      }

      if (!folderPath) return false;
      await writeFile(filePath, model.getValue(), folderPath);
      if (workspaceTrusted && languageId !== "plaintext") {
        try {
          await window.axon.syncLanguageServerDocument({
            folderPath,
            filePath,
            languageId,
            content: model.getValue(),
          });
        } catch (error) {
          // Saving must not fail because a language server is unavailable. The
          // disk write is already complete, while the ordinary LSP reconnect
          // path can synchronize this document when the server returns.
          console.error("failed to sync saved file with language server:", error);
        }
      }

      setLayout((current) => ({
        ...current,
        panes: current.panes.map((pane) => ({
          ...pane,
          dirtyFiles: {
            ...pane.dirtyFiles,
            [filePath]: false,
          },
        })),
      }));
      window.dispatchEvent(
        new CustomEvent("axon:fileSaved", { detail: { path: filePath } }),
      );
      if (options.announce !== false) {
        appendOutput("file", `Saved ${filePath}`, "success");
      }
      return true;
    },
    [appendOutput, folderPath, formatOnSave, setLayout, workspaceTrusted],
  );
}
