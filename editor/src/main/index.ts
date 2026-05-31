import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  protocol,
  net,
} from "electron";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import url from "url";

const isDev = process.env.NODE_ENV === "development";
app.setName("Axon");

const isMac = process.platform === "darwin";

const axonAppMenu: MenuItemConstructorOptions = {
  label: "Axon",
  submenu: [
    { role: "about" },
    { type: "separator" },
    { role: "hide" },
    { role: "hideOthers" },
    { role: "unhide" },
    { type: "separator" },
    { role: "quit" },
  ] as MenuItemConstructorOptions[],
};

const template: MenuItemConstructorOptions[] = [
  ...(isMac ? [axonAppMenu] : []),
  { role: "fileMenu" } as MenuItemConstructorOptions,
  { role: "editMenu" } as MenuItemConstructorOptions,
  { role: "viewMenu" } as MenuItemConstructorOptions,
  { role: "windowMenu" } as MenuItemConstructorOptions,
  { role: "help" } as MenuItemConstructorOptions,
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));

let mainWindow: BrowserWindow | null = null;

// holds the active chokidar watcher so we can stop it when switching files
let activeWatcher: FSWatcher | null = null;
let folderWatcher: FSWatcher | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Axon",
    titleBarStyle: "hidden",
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

app.whenReady().then(() => {
  // handle axon://local/absolute/path requests
  // streams the file directly to the renderer
  protocol.handle("axon", (request) => {
    const filePath = decodeURIComponent(
      request.url.replace("axon://local", ""),
    );
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// watches the entire open folder for any changes (create, delete, rename)
// and notifies the renderer to refresh the file tree.
// debounced to avoid rapid fire events from bulk operations.

ipcMain.handle("fs:watchFolder", async (_event, folderPath: string) => {
  if (folderWatcher) {
    await folderWatcher.close();
    folderWatcher = null;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  folderWatcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,
    // ignore hidden files, node_modules, vendor, dist
    ignored: /(^|[\/\\])(\.|node_modules|vendor|dist)/,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  const notify = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mainWindow?.webContents.send("fs:folderChanged");
    }, 300);
  };

  folderWatcher.on("add", notify);
  folderWatcher.on("unlink", notify);
  folderWatcher.on("addDir", notify);
  folderWatcher.on("unlinkDir", notify);
});

ipcMain.handle("fs:unwatchFolder", async () => {
  if (folderWatcher) {
    await folderWatcher.close();
    folderWatcher = null;
  }
});

// register axon:// protocol before app is ready
// this lets the renderer load local files via axon://path/to/file
// without needing file:// which Electron blocks for security
protocol.registerSchemesAsPrivileged([
  {
    scheme: "axon",
    privileges: { secure: true, standard: true, stream: true },
  },
]);
