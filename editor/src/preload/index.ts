// The preload script runs in a privileged context between the Electron main
// process and the renderer (React). It uses contextBridge to safely expose
// a controlled API surface to the renderer, the renderer never gets direct
// access to Node.js or Electron internals, only what we explicitly expose here.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("axon", {
  // platform info
  platform: process.platform,

  // IPC bridge renderer calls these to talk to the main process
  // which then forwards to the Go backend or handles natively
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
});
