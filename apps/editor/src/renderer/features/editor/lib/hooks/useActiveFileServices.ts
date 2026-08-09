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
    void window.axon.watchFile(filePath);
    const stopInstallListener = window.axon.onManagedLanguageToolProgress(
      (progress) => {
        if (progress.phase === "installed") warmAndSync();
      },
    );
    return () => {
      disposed = true;
      stopInstallListener();
      void window.axon.unwatchFile();
    };
  }, [enabled, filePath, folderPath, loading, syncDocument, visible]);
}
