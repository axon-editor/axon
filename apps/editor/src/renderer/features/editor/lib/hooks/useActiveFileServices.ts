/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from "react";
import { detectLanguageServerLanguage } from "../buffer/monacoModels";

interface ActiveFileServicesOptions {
  enabled: boolean;
  filePath: string;
  folderPath: string | null;
  loading: boolean;
  syncDocument: () => void;
  visible: boolean;
}

export function useActiveFileServices({
  enabled,
  filePath,
  folderPath,
  loading,
  syncDocument,
  visible,
}: ActiveFileServicesOptions) {
  // File watching is independent of visibility. Every mounted buffer needs its
  // own OS-level watcher so external edits (formatters, git checkouts, scripts)
  // are detected even when the file is in a background tab or inactive split
  // pane. Without this, only the focused pane's file gets watched and all other
  // open files silently serve stale cache entries on next switch.
  useEffect(() => {
    if (loading) return;
    void window.axon.watchFile(filePath);
    return () => {
      void window.axon.unwatchFile(filePath);
    };
  }, [filePath, loading]);

  useEffect(() => {
    if (!visible || loading) return;
    let disposed = false;
    const languageId = detectLanguageServerLanguage(filePath);
    const warmAndSync = () => {
      syncDocument();
      if (!enabled || !folderPath || languageId === "plaintext") return;
      void window.axon
        .startLanguageServerForLanguage({ folderPath, languageId })
        .then((result) => {
          if (!disposed && result.ok) syncDocument();
        });
    };

    warmAndSync();
    const stopInstallListener = window.axon.onManagedLanguageToolProgress(
      (progress) => {
        if (progress.phase === "installed") warmAndSync();
      },
    );
    return () => {
      disposed = true;
      stopInstallListener();
    };
  }, [enabled, filePath, folderPath, loading, syncDocument, visible]);
}
