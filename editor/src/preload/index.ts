// Exposes a controlled API surface to the renderer via contextBridge.
// The renderer never gets direct Node.js access, only what is explicitly
// defined here. fs.onFileChanged uses ipcRenderer.on so the main process
// can push file change events to the renderer without polling.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("axon", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  watchFile: (path: string) => ipcRenderer.invoke("fs:watch", path),
  unwatchFile: () => ipcRenderer.invoke("fs:unwatch"),
  watchFolder: (path: string) => ipcRenderer.invoke("fs:watchFolder", path),
  unwatchFolder: () => ipcRenderer.invoke("fs:unwatchFolder"),

  onFileChanged: (
    callback: (data: { path: string; content: string }) => void,
  ) => {
    const handler = (_: unknown, data: { path: string; content: string }) =>
      callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },

  // notifies renderer when any file is created, deleted, or renamed in the folder
  onFolderChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("fs:folderChanged", handler);
    return () => ipcRenderer.removeListener("fs:folderChanged", handler);
  },
});
