import { useEffect } from "react";

interface ActiveFileServicesOptions {
  filePath: string;
  loading: boolean;
  syncDocument: () => void;
  visible: boolean;
}

export function useActiveFileServices({
  filePath,
  loading,
  syncDocument,
  visible,
}: ActiveFileServicesOptions) {
  useEffect(() => {
    if (!visible || loading) return;
    syncDocument();
    void window.axon.watchFile(filePath);
    return () => {
      void window.axon.unwatchFile();
    };
  }, [filePath, loading, syncDocument, visible]);
}
