import { BrowserWindow, ipcMain } from "electron";
import type { ManagedLanguageToolId } from "../../shared/languageTools";
import type { ManagedLanguageToolManager } from "./manager";

export function registerManagedLanguageToolHandlers(
  manager: ManagedLanguageToolManager,
) {
  ipcMain.handle("languageTools:recommendation", async (_event, languageId: string) => {
    return manager.getRecommendation(languageId);
  });
  ipcMain.handle("languageTools:statusForLanguage", async (_event, languageId: string) => {
    return manager.getStatusForLanguage(languageId);
  });
  ipcMain.handle("languageTools:status", async (_event, id: ManagedLanguageToolId) => {
    return manager.getStatus(id);
  });
  ipcMain.handle("languageTools:list", async () => manager.listStatuses());
  ipcMain.handle(
    "languageTools:install",
    async (event, id: ManagedLanguageToolId) => {
      return manager.install(id, BrowserWindow.fromWebContents(event.sender));
    },
  );
}
