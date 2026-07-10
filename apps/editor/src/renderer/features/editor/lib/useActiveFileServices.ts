import { useEffect } from "react";

import { getModel } from "./monacoModels";

interface ActiveFileServicesOptions {
  filePath: string;
  loading: boolean;
  syncDocument: (content: string) => void;
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
    const model = getModel(filePath);
    if (model && !model.isDisposed()) syncDocument(model.getValue());
    void window.axon.watchFile(filePath);
    return () => {
      void window.axon.unwatchFile();
    };
  }, [filePath, loading, syncDocument, visible]);
}
