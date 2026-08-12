import { useEffect, useRef } from "react";
import {
  getModel,
  isModelMarkedDirty,
} from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { dispatchEditorSave } from "../../../renderer/features/editor/lib/buffer/editorSave";
import { type Layout } from "../../../renderer/features/editor/lib/layout/types";

const AUTO_SAVE_DELAY_MS = 1_000;

interface AutoSaveOptions {
  enabled: boolean;
  panes: Layout["panes"];
  saveDetachedFile: (filePath: string) => Promise<boolean>;
  onError: (message: string) => void;
}

export function useAutoSave({
  enabled,
  panes,
  saveDetachedFile,
  onError,
}: AutoSaveOptions) {
  const timersRef = useRef(
    new Map<string, { timer: number; version: number }>(),
  );

  useEffect(() => {
    const timers = timersRef.current;
    if (!enabled) {
      for (const pending of timers.values()) {
        window.clearTimeout(pending.timer);
      }
      timers.clear();
      return;
    }

    const dirtyFiles = new Set(
      panes.flatMap((pane) =>
        Object.entries(pane.dirtyFiles)
          .filter(([, dirty]) => dirty)
          .map(([filePath]) => filePath),
      ),
    );

    for (const [filePath, pending] of timers) {
      if (dirtyFiles.has(filePath)) continue;
      window.clearTimeout(pending.timer);
      timers.delete(filePath);
    }

    for (const filePath of dirtyFiles) {
      const version = getModel(filePath)?.getVersionId() ?? -1;
      const pending = timers.get(filePath);
      // Each file owns its own trailing timer and Monaco version. Re-rendering
      // because another tab changed must not postpone this file indefinitely,
      // while a newer version of this same buffer must restart the delay so a
      // pause in typing, rather than an arbitrary earlier keystroke, triggers
      // the disk write.
      if (pending?.version === version) continue;
      if (pending) window.clearTimeout(pending.timer);

      const timer = window.setTimeout(() => {
        if (timers.get(filePath)?.timer === timer) timers.delete(filePath);
        if (!isModelMarkedDirty(filePath)) return;

        // A visible editor owns view-state restoration and queued formatting.
        // Hidden or temporarily detached tabs still retain a shared Monaco
        // model, so they fall back to the workbench save path instead of being
        // skipped until the user activates them again.
        if (dispatchEditorSave(filePath)) return;
        void saveDetachedFile(filePath).catch((error) => {
          onError(error instanceof Error ? error.message : "Auto Save failed.");
        });
      }, AUTO_SAVE_DELAY_MS);
      timers.set(filePath, { timer, version });
    }
  }, [enabled, onError, panes, saveDetachedFile]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const pending of timers.values()) {
        window.clearTimeout(pending.timer);
      }
      timers.clear();
    };
  }, []);
}
