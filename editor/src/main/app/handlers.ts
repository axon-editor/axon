import { app, clipboard, ipcMain, shell } from "electron";

interface AppHandlerDependencies {
  windowSessionRestore: Map<number, boolean>;
  isExternalHandlerUrl: (href: string) => boolean;
}

export function registerAppHandlers({
  windowSessionRestore,
  isExternalHandlerUrl,
}: AppHandlerDependencies) {
  ipcMain.handle("app:getInfo", async () => {
    return {
      name: "Axon",
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
    };
  });

  ipcMain.handle("app:shouldRestoreSession", (event) => {
    return windowSessionRestore.get(event.sender.id) !== false;
  });

  ipcMain.handle("shell:openExternal", async (_event, href: string) => {
    if (!isExternalHandlerUrl(href)) {
      throw new Error("Only external web, mail, and phone links can be opened.");
    }

    await shell.openExternal(href);
  });

  ipcMain.handle("clipboard:writeText", async (_event, text: string) => {
    clipboard.writeText(text);
  });
}
