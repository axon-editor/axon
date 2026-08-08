import { useEffect, useRef, useState } from "react";

import { type FolderChangeEvent } from "../../../../../shared/fs";

export function useTreeRefreshRequest(folderPath: string | null) {
  const [request, setRequest] = useState<
    (FolderChangeEvent & { id: number }) | null
  >(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return window.axon.onFolderChanged((event) => {
      if (!event) return;

      // The monotonically increasing ID makes two equal path batches distinct to
      // React and to expanded folder effects. This matters when an agent deletes
      // and recreates the same file without selecting another explorer entry.
      requestIdRef.current += 1;
      setRequest({ ...event, id: requestIdRef.current });
    });
  }, [folderPath]);

  return request;
}
