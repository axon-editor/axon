/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, ipcMain } from "electron";
import type { ManagedLanguageToolId } from "../../shared/languageTools";
import type { ManagedLanguageToolManager } from "./manager";

export function registerManagedLanguageToolHandlers(
  manager: ManagedLanguageToolManager,
) {
  ipcMain.handle(
    "languageTools:recommendation",
    async (_event, languageId: string) => {
      return manager.getRecommendation(languageId);
    },
  );
  ipcMain.handle(
    "languageTools:statusForLanguage",
    async (_event, languageId: string) => {
      return manager.getStatusForLanguage(languageId);
    },
  );
  ipcMain.handle(
    "languageTools:status",
    async (_event, id: ManagedLanguageToolId) => {
      return manager.getStatus(id);
    },
  );
  ipcMain.handle("languageTools:list", async () => manager.listStatuses());
  ipcMain.handle(
    "languageTools:installProgress",
    async (event, id: ManagedLanguageToolId) =>
      manager.getInstallProgress(
        id,
        BrowserWindow.fromWebContents(event.sender),
      ),
  );
  ipcMain.handle("languageTools:listInstallProgress", async (event) =>
    manager.listInstallProgress(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle(
    "languageTools:install",
    async (event, id: ManagedLanguageToolId) => {
      return manager.install(id, BrowserWindow.fromWebContents(event.sender));
    },
  );
  ipcMain.handle(
    "languageTools:cancel",
    async (_event, id: ManagedLanguageToolId) => manager.cancel(id),
  );
  ipcMain.handle(
    "languageTools:uninstall",
    async (_event, id: ManagedLanguageToolId) => manager.uninstall(id),
  );
}
