// Electron main process — the Node.js entry point for Axon.
// Responsible for creating the browser window, handling native dialogs,
// and bridging IPC calls from the renderer to the Go backend or OS.
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

// base URL for the Go backend, hardcoded for now, will be configurable later
const CORE_URL = "http://localhost:7777";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

// handle folder open dialog
// invoked from the renderer via window.axon.openFolder()
// returns the selected folder path or null if cancelled
ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
