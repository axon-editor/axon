import { useCallback, type Dispatch, type SetStateAction } from "react";

import { getModel } from "../../../renderer/features/editor/lib/monacoModels";
import { replacePathInLayout } from "../../../renderer/features/editor/lib/layoutManager";
import type { Layout } from "../../../renderer/features/editor/lib/types";

interface SaveFileAsOptions {
  activeFile: string | null;
  appendOutput: (source: string, message: string, level?: "info" | "success" | "warning" | "error") => void;
  handleRefresh: () => void | Promise<void>;
  setLayout: Dispatch<SetStateAction<Layout>>;
}

export function useSaveFileAs({
  activeFile,
  appendOutput,
  handleRefresh,
  setLayout,
}: SaveFileAsOptions) {
  return useCallback(async () => {
    if (!activeFile) return;
    const model = getModel(activeFile);
    if (!model || model.isDisposed()) {
      appendOutput("file", "Could not find editor buffer to save.", "error");
      return;
    }

    try {
      const targetPath = await window.axon.saveFileAs(activeFile, model.getValue());
      if (!targetPath || targetPath === activeFile) return;
      setLayout((current) => {
        const replaced = replacePathInLayout(current, activeFile, targetPath);
        return {
          ...replaced,
          panes: replaced.panes.map((pane) => ({
            ...pane,
            dirtyFiles: { ...pane.dirtyFiles, [targetPath]: false },
          })),
        };
      });
      appendOutput("file", `Saved ${targetPath}`, "success");
      void handleRefresh();
    } catch (err) {
      appendOutput(
        "file",
        err instanceof Error ? err.message : "Save As failed.",
        "error",
      );
    }
  }, [activeFile, appendOutput, handleRefresh, setLayout]);
}
