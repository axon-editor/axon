import { ipcMain, type WebContents } from "electron";
import { type FileWatcherManager } from "./watcher";
import { importExternalEntries } from "./importEntries";
import { listProjectFiles } from "./projectFiles";
import { getWorkspaceIndex } from "./workspaceIndex";

export function registerFileWatcherHandlers(
  createFileWatcherManager: (sender: WebContents) => FileWatcherManager,
) {
  const managers = new Map<number, FileWatcherManager>();

  const getManager = (sender: WebContents) => {
    const senderId = sender.id;
    const existing = managers.get(senderId);
    if (existing) return existing;

    const manager = createFileWatcherManager(sender);
    managers.set(senderId, manager);
    sender.once("destroyed", () => {
      // Capture the id before destruction. Electron can reject property access
      // on a destroyed WebContents, which would otherwise leak this manager and
      // leave its native watchers alive after the window closes.
      if (managers.get(senderId) !== manager) return;
      managers.delete(senderId);
      void manager.closeAll();
    });
    return manager;
  };

  // File watchers feed external editor changes back into the active pane so
  // Axon keeps the open document in sync without forcing a reload cycle.
  ipcMain.handle("fs:watch", async (event, filePath: string) => {
    await getManager(event.sender).watchFile(filePath);
  });

  ipcMain.handle("fs:unwatch", async (event) => {
    await getManager(event.sender).unwatchFile();
  });

  // Workspace watchers cover the file tree, git changes, and generated output.
  // The manager owns the debounce and ignore rules so the IPC layer stays thin.
  ipcMain.handle("fs:watchFolder", async (event, folderPath: string) => {
    await getManager(event.sender).watchFolder(folderPath);
  });

  ipcMain.handle("fs:unwatchFolder", async (event) => {
    await getManager(event.sender).unwatchFolder();
  });

  ipcMain.handle("fs:listProjectFiles", async (_event, folderPath: string) => {
    if (!folderPath || typeof folderPath !== "string") return [];
    return listProjectFiles(folderPath);
  });

  ipcMain.handle("fs:getWorkspaceIndex", async (_event, folderPath: string) => {
    if (!folderPath || typeof folderPath !== "string") return null;
    return getWorkspaceIndex(folderPath);
  });

  ipcMain.handle(
    "fs:importEntries",
    async (_event, sourcePaths: string[], targetDir: string) => {
      return importExternalEntries(sourcePaths, targetDir);
    },
  );

  return {
    async closeAll() {
      const activeManagers = [...managers.values()];
      managers.clear();
      await Promise.allSettled(
        activeManagers.map((manager) => manager.closeAll()),
      );
    },
  };
}
