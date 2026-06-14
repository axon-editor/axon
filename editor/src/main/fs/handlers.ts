import { ipcMain } from "electron";
import { type FileWatcherManager } from "./watcher";
import { importExternalEntries } from "./importEntries";

export function registerFileWatcherHandlers(fileWatcherManager: FileWatcherManager) {
  // File watchers feed external editor changes back into the active pane so
  // Axon keeps the open document in sync without forcing a reload cycle.
  ipcMain.handle("fs:watch", async (_event, filePath: string) => {
    await fileWatcherManager.watchFile(filePath);
  });

  ipcMain.handle("fs:unwatch", async () => {
    await fileWatcherManager.unwatchFile();
  });

  // Workspace watchers cover the file tree, git changes, and generated output.
  // The manager owns the debounce and ignore rules so the IPC layer stays thin.
  ipcMain.handle("fs:watchFolder", async (_event, folderPath: string) => {
    await fileWatcherManager.watchFolder(folderPath);
  });

  ipcMain.handle("fs:unwatchFolder", async () => {
    await fileWatcherManager.unwatchFolder();
  });

  ipcMain.handle(
    "fs:importEntries",
    async (_event, sourcePaths: string[], targetDir: string) => {
      return importExternalEntries(sourcePaths, targetDir);
    },
  );
}
