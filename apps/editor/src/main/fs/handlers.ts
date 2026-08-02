import { ipcMain, type WebContents } from "electron";
import path from "path";
import { type FileWatcherManager } from "./watcher";
import { importExternalEntries } from "./importEntries";
import { listProjectFiles } from "./projectFiles";
import { getWorkspaceIndex } from "./workspaceIndex";

export function registerFileWatcherHandlers(
  createFileWatcherManager: (
    sendToRenderer: (channel: string, payload?: unknown) => void,
  ) => FileWatcherManager,
  setWorkspaceWindowTitle: (
    sender: WebContents,
    folderPath: string | null,
  ) => void = () => undefined,
) {
  const activeFileManagers = new Map<number, FileWatcherManager>();
  const boundSenders = new Set<number>();
  const workspaceBySender = new Map<number, string>();
  const workspaceWatchers = new Map<
    string,
    {
      folderPath: string;
      manager: FileWatcherManager;
      ready: Promise<void>;
      subscribers: Map<number, WebContents>;
    }
  >();

  const releaseWorkspace = async (senderId: number) => {
    const key = workspaceBySender.get(senderId);
    if (!key) return;
    workspaceBySender.delete(senderId);
    const entry = workspaceWatchers.get(key);
    if (!entry) return;
    entry.subscribers.delete(senderId);
    if (entry.subscribers.size > 0) return;
    workspaceWatchers.delete(key);
    await entry.manager.unwatchFolder();
  };

  const bindSenderLifecycle = (sender: WebContents) => {
    const senderId = sender.id;
    if (boundSenders.has(senderId)) return;
    boundSenders.add(senderId);
    sender.once("destroyed", () => {
      if (!boundSenders.delete(senderId)) return;
      const activeFileManager = activeFileManagers.get(senderId);
      activeFileManagers.delete(senderId);
      if (activeFileManager) void activeFileManager.closeAll();
      void releaseWorkspace(senderId);
    });
  };

  const getActiveFileManager = (sender: WebContents) => {
    bindSenderLifecycle(sender);
    const existing = activeFileManagers.get(sender.id);
    if (existing) return existing;
    const manager = createFileWatcherManager((channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, payload);
    });
    activeFileManagers.set(sender.id, manager);
    return manager;
  };

  // File watchers feed external editor changes back into the active pane so
  // Axon keeps the open document in sync without forcing a reload cycle.
  ipcMain.handle("fs:watch", async (event, filePath: string) => {
    await getActiveFileManager(event.sender).watchFile(filePath);
  });

  ipcMain.handle("fs:unwatch", async (event) => {
    await getActiveFileManager(event.sender).unwatchFile();
  });

  // Workspace watchers cover the file tree, git changes, and generated output.
  // The manager owns the debounce and ignore rules so the IPC layer stays thin.
  ipcMain.handle("fs:watchFolder", async (event, folderPath: string) => {
    const sender = event.sender;
    const senderId = sender.id;
    bindSenderLifecycle(sender);
    const key = path.resolve(folderPath);
    if (workspaceBySender.get(senderId) === key) {
      setWorkspaceWindowTitle(sender, folderPath);
      return;
    }
    await releaseWorkspace(senderId);

    let entry = workspaceWatchers.get(key);
    if (!entry) {
      const subscribers = new Map<number, WebContents>();
      const manager = createFileWatcherManager((channel, payload) => {
        subscribers.forEach((subscriber) => {
          if (!subscriber.isDestroyed()) subscriber.send(channel, payload);
        });
      });
      const ready = manager.watchFolder(folderPath);
      entry = { folderPath, manager, ready, subscribers };
      workspaceWatchers.set(key, entry);
      entry.subscribers.set(senderId, sender);
      workspaceBySender.set(senderId, key);
      try {
        await ready;
      } catch (error) {
        entry.subscribers.forEach((_subscriber, subscriberId) => {
          if (workspaceBySender.get(subscriberId) === key) {
            workspaceBySender.delete(subscriberId);
          }
        });
        workspaceWatchers.delete(key);
        entry.subscribers.clear();
        await manager.closeAll();
        throw error;
      }
      setWorkspaceWindowTitle(sender, folderPath);
      return;
    }

    entry.subscribers.set(senderId, sender);
    workspaceBySender.set(senderId, key);
    await entry.ready;
    setWorkspaceWindowTitle(sender, folderPath);
  });

  ipcMain.handle("fs:unwatchFolder", async (event) => {
    await releaseWorkspace(event.sender.id);
    setWorkspaceWindowTitle(event.sender, null);
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
      const activeManagers = [...activeFileManagers.values()];
      const activeWorkspaceWatchers = [...workspaceWatchers.values()];
      activeFileManagers.clear();
      boundSenders.clear();
      workspaceBySender.clear();
      workspaceWatchers.clear();
      await Promise.allSettled(
        [
          ...activeManagers.map((manager) => manager.closeAll()),
          ...activeWorkspaceWatchers.map((entry) =>
            entry.manager.unwatchFolder(),
          ),
        ],
      );
    },
  };
}
