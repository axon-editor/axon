import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("axon", {
  // we'll expand this as we add features
  platform: process.platform,
});
