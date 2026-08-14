import { useEffect, useState } from "react";
import { type OpenWorkspaceFolder } from "../../../../../shared/app";
import { type WorkspaceRoot } from "../../../../shared/lib/workspaceRoots";

function createLocalFallback(roots: WorkspaceRoot[]): OpenWorkspaceFolder[] {
  return roots.map((root) => ({
    path: root.path,
    name: root.name,
    rendererId: -1,
    currentWindow: true,
  }));
}

export function useOpenWorkspaceFolders(workspaceRoots: WorkspaceRoot[]) {
  const [folders, setFolders] = useState<OpenWorkspaceFolder[]>(() =>
    createLocalFallback(workspaceRoots),
  );

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.axon.onOpenWorkspaceFoldersChanged(
      (nextFolders) => {
        if (!disposed) setFolders(nextFolders);
      },
    );

    void window.axon.listOpenWorkspaceFolders().then((nextFolders) => {
      if (!disposed) setFolders(nextFolders);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const localFallback = createLocalFallback(workspaceRoots);

    // Main owns the cross-window registry because BrowserWindow lifetime is
    // authoritative there. Reporting only paths keeps renderer-controlled
    // labels and window IDs out of the trust boundary; main resolves names,
    // associates the sender, deduplicates paths, and broadcasts the result.
    void window.axon
      .updateOpenWorkspaceFolders(workspaceRoots.map((root) => root.path))
      .then((nextFolders) => {
        if (!disposed) setFolders(nextFolders);
      })
      .catch(() => {
        if (!disposed) setFolders(localFallback);
      });

    return () => {
      disposed = true;
    };
  }, [workspaceRoots]);

  return folders;
}
