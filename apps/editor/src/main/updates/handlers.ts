import { ipcMain } from "electron";
import { type UpdateActionResult } from "../../shared/updates";
import { type UpdateManager } from "./updater";

export function registerUpdateHandlers(updateManager: UpdateManager) {
  ipcMain.handle("app:checkForUpdates", async () => {
    return updateManager.checkForUpdate();
  });

  ipcMain.handle("app:getUpdateInstallState", async () => {
    return updateManager.getState();
  });

  ipcMain.handle("app:downloadUpdate", async (): Promise<UpdateActionResult> => {
    return updateManager.requestDownload();
  });

  ipcMain.handle("app:installUpdate", async (): Promise<UpdateActionResult> => {
    return updateManager.requestInstall();
  });

  ipcMain.handle("app:openUpdatePage", async (_event, releaseUrl?: string) => {
    await updateManager.openReleasePage(releaseUrl);
  });
}
