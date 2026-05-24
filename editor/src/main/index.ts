import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";

const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;

// holds the active chokidar watcher so we can stop it when switching files
let activeWatcher: FSWatcher | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
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
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// watch a file for external changes and notify the renderer when it changes.
// stops any previously active watcher first so we only ever watch one file.
// uses a small debounce delay to avoid multiple rapid fire events from
// editors that do atomic saves (write to temp then rename).
ipcMain.handle("fs:watch", async (_event, filePath: string) => {
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  activeWatcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  activeWatcher.on("change", () => {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const content = fs.readFileSync(filePath, "utf-8");
      // push the new content to the renderer via webContents.send
      mainWindow?.webContents.send("fs:fileChanged", {
        path: filePath,
        content,
      });
    }, 150);
  });
});

// stop watching when the renderer no longer needs it
ipcMain.handle("fs:unwatch", async () => {
  if (activeWatcher) {
    await activeWatcher.close();
    activeWatcher = null;
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
