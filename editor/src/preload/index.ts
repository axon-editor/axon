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

  // registers a callback for external file change events pushed from main.
  // returns a cleanup function to remove the listener when no longer needed.
  onFileChanged: (
    callback: (data: { path: string; content: string }) => void,
  ) => {
    const handler = (_: unknown, data: { path: string; content: string }) =>
      callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },
});
