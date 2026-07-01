import fs from "fs";
import { ipcMain, shell } from "electron";
import {
  type ExtensionActionResult,
  type ExtensionMarketplaceState,
  type ExtensionState,
} from "../../shared/extensions";
import { extensionHostService } from "./host/service";
import { getUserExtensionsPath } from "./paths";

export function registerExtensionHandlers() {
  ipcMain.handle(
    "extensions:list",
    async (_event, folderPath?: string | null): Promise<ExtensionState> => {
      return extensionHostService.getState(folderPath);
    },
  );

  ipcMain.handle(
    "extensions:setEnabled",
    async (
      _event,
      extensionId: string,
      enabled: boolean,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      if (!extensionId || extensionId === "axon.builtin") {
        return {
          ok: false,
          message: "Built-in extensions cannot be disabled.",
          state: extensionHostService.getState(folderPath),
        };
      }

      return extensionHostService.setEnabled(extensionId, enabled, folderPath);
    },
  );

  ipcMain.handle(
    "extensions:reload",
    async (
      _event,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.reload(folderPath);
    },
  );

  ipcMain.handle(
    "extensions:marketplace",
    async (): Promise<ExtensionMarketplaceState> => {
      return extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    "extensions:themeMarketplace",
    async (): Promise<ExtensionMarketplaceState> => {
      return extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    "extensions:install",
    async (
      _event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.install(extensionId, folderPath);
    },
  );

  ipcMain.handle(
    "extensions:installTheme",
    async (
      _event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.install(extensionId, folderPath);
    },
  );

  ipcMain.handle(
    "extensions:openFolder",
    async (
      _event,
      workspacePath?: string | null,
    ): Promise<ExtensionActionResult> => {
      const userExtensionsPath = getUserExtensionsPath();
      fs.mkdirSync(userExtensionsPath, { recursive: true });
      const openError = await shell.openPath(userExtensionsPath);

      // Electron reports shell.openPath failures as a returned string instead
      // of throwing. Returning a normal action result keeps the renderer from
      // showing a vague IPC failure when Finder cannot open the folder for
      // platform or permission reasons.
      if (openError) {
        return {
          ok: false,
          message: openError,
          state: extensionHostService.getState(workspacePath),
        };
      }

      return {
        ok: true,
        message: "Opened user extensions folder.",
        state: extensionHostService.getState(workspacePath),
      };
    },
  );
}
